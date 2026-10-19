import { authenticateTelegramRequest } from '../../lib/telegramAuth';
import {
	getFunctionalTestsHistory,
	recordFunctionalTest,
	type FunctionalTestInput
} from '../../lib/fitnessService';

interface Env {
	DB: D1Database;
	TELEGRAM_BOT_TOKEN?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const tests = await getFunctionalTestsHistory(context.env.DB, auth.user.id.toString());
		return new Response(JSON.stringify({ tests }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Tests query failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
	const auth = await authenticateTelegramRequest(context.request, context.env.TELEGRAM_BOT_TOKEN);
	if (!auth.isValid || !auth.user) {
		return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body = (await context.request.json()) as FunctionalTestInput;
		const result = await recordFunctionalTest(
			context.env.DB,
			auth.user.id.toString(),
			body
		);

		if (!result.success) {
			return new Response(JSON.stringify({ error: result.error }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const tests = await getFunctionalTestsHistory(context.env.DB, auth.user.id.toString());

		return new Response(JSON.stringify({ success: true, id: result.id, tests }), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Record test failed';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
