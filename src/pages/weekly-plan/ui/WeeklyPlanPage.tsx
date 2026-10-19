import styles from './WeeklyPlanPage.module.css';
import { useFitnessStore } from '@entities/fitness';
import { useHabitsStore } from '@entities/habit';
import { HabitList } from '@widgets/habit-list';
import { FaFire, FaDumbbell, FaHeartbeat, FaLightbulb, FaBars, FaBook, FaTrophy, FaPlus } from 'react-icons/fa';
import { GiBoxingGlove } from 'react-icons/gi';
import { Button } from '@shared/ui';
import { getNavigationTarget } from '@shared/lib/router';
import { t } from 'i18next';
import { toast } from 'sonner';

export function WeeklyPlanPage() {
	const plan = useFitnessStore((s) => s.plan);
	const habits = useHabitsStore((s) => s.habits);
	const habitsDispatch = useHabitsStore((s) => s.habitsDispatch);

	const menuTarget = getNavigationTarget('MENU', {
		modalTitle: t('menu.title')
	});

	const diaryTarget = getNavigationTarget('DIARY', {
		modalTitle: t('notes.title')
	});

	const achievementsTarget = getNavigationTarget('ACHIEVEMENTS', {
		modalTitle: t('achievements.title')
	});

	const newHabitTarget = getNavigationTarget('HABIT_EDITOR', {
		modalTitle: t('habits.actions.createNew')
	});

	// Helper to seed recommended Mayweather daily routines if habits list is empty
	const handleSeedMayweatherHabits = () => {
		const routines = [
			{ title: 'Бой с тенью перед зеркалом (15 мин)', frequency: '1', colorIndex: '4', iconTitle: 'boxing' },
			{ title: 'Прыжки на скакалке (10 мин)', frequency: '1', colorIndex: '2', iconTitle: 'fitness' },
			{ title: 'Водный баланс (2.5 литра)', frequency: '1', colorIndex: '1', iconTitle: 'water' },
			{ title: 'Отработка уклонов и нырков', frequency: '1', colorIndex: '0', iconTitle: 'boxing' },
			{ title: 'Восстановительный сон 8 часов', frequency: '1', colorIndex: '3', iconTitle: 'moon' }
		];

		routines.forEach((r) => {
			habitsDispatch({
				type: 'addHabit',
				payload: {
					data: {
						title: r.title,
						frequency: r.frequency,
						colorIndex: r.colorIndex,
						iconTitle: r.iconTitle
					}
				}
			});
		});

		toast.success('Режимные привычки Mayweather добавлены в трекер!');
	};

	const boxingProgress = plan
		? Math.min(100, Math.round((plan.completed_boxing_sessions / plan.target_boxing_sessions) * 100))
		: 66;

	const strengthProgress = plan
		? Math.min(100, Math.round((plan.completed_strength_sessions / plan.target_strength_sessions) * 100))
		: 50;

	const cardioProgress = plan
		? Math.min(100, Math.round((plan.completed_cardio_minutes / plan.target_cardio_minutes) * 100))
		: 72;

	return (
		<div className={styles.container}>
			{/* 1. Weekly Target Progress Dashboard */}
			<section className={styles.planSection}>
				<div className={styles.planHeader}>
					<div className={styles.planTitleBox}>
						<FaFire className={styles.fireIcon} />
						<div>
							<h2>Недельный план чемпиона</h2>
							<span className={styles.planSubtitle}>Цели и объём тренировок на текущую неделю</span>
						</div>
					</div>
				</div>

				<div className={styles.metricsRow}>
					{/* Boxing Target */}
					<div className={styles.planMetricCard}>
						<div className={styles.metricHeader}>
							<GiBoxingGlove className={styles.metricIconBoxing} />
							<span className={styles.metricName}>Бокс</span>
						</div>
						<div className={styles.metricVal}>
							<strong>{plan?.completed_boxing_sessions ?? 2}</strong>
							<span>/ {plan?.target_boxing_sessions ?? 3} тренировок</span>
						</div>
						<div className={styles.progressBarBg}>
							<div
								className={styles.progressBarFillGold}
								style={{ width: `${boxingProgress}%` }}
							/>
						</div>
					</div>

					{/* Strength Target */}
					<div className={styles.planMetricCard}>
						<div className={styles.metricHeader}>
							<FaDumbbell className={styles.metricIconStrength} />
							<span className={styles.metricName}>Сила</span>
						</div>
						<div className={styles.metricVal}>
							<strong>{plan?.completed_strength_sessions ?? 1}</strong>
							<span>/ {plan?.target_strength_sessions ?? 2} тренировок</span>
						</div>
						<div className={styles.progressBarBg}>
							<div
								className={styles.progressBarFillSilver}
								style={{ width: `${strengthProgress}%` }}
							/>
						</div>
					</div>

					{/* Cardio Target */}
					<div className={styles.planMetricCard}>
						<div className={styles.metricHeader}>
							<FaHeartbeat className={styles.metricIconCardio} />
							<span className={styles.metricName}>Кардио</span>
						</div>
						<div className={styles.metricVal}>
							<strong>{plan?.completed_cardio_minutes ?? 65}</strong>
							<span>/ {plan?.target_cardio_minutes ?? 90} мин</span>
						</div>
						<div className={styles.progressBarBg}>
							<div
								className={styles.progressBarFillRed}
								style={{ width: `${cardioProgress}%` }}
							/>
						</div>
					</div>
				</div>

				{/* Coach's tactical recommendation */}
				<div className={styles.coachCard}>
					<FaLightbulb className={styles.coachIcon} />
					<div className={styles.coachText}>
						<div className={styles.coachTitle}>Совет тренера (Coach Alex)</div>
						<p>
							{plan?.coach_recommendation ??
								'Фокус недели: постановка защитного движения плечом (Mayweather Shoulder Roll) и сохранение баланса ног при отходе назад.'}
						</p>
					</div>
				</div>
			</section>

			{/* 2. Embedded DoHabit Habit Tracker Widget */}
			<section className={styles.habitTrackerSection}>
				<div className={styles.habitTrackerHeader}>
					<div className={styles.habitTrackerTitle}>
						<h3>Ежедневный режим & Привычки (DoHabit)</h3>
						<span className={styles.habitTrackerSub}>
							Интегрированный модуль трекера привычек
						</span>
					</div>

					<div className={styles.habitActions}>
						<Button
							to={newHabitTarget.to}
							state={newHabitTarget.state}
							className={styles.quickActionBtn}
							title="Добавить привычку"
						>
							<FaPlus />
						</Button>
					</div>
				</div>

				{/* Quick Tools Navigation (Menu, Diary, Achievements) */}
				<div className={styles.quickToolsNav}>
					<Button
						to={menuTarget.to}
						state={menuTarget.state}
						className={styles.toolBtn}
					>
						<FaBars /> Меню & Опции
					</Button>

					<Button
						to={diaryTarget.to}
						state={diaryTarget.state}
						className={styles.toolBtn}
					>
						<FaBook /> Дневник
					</Button>

					<Button
						to={achievementsTarget.to}
						state={achievementsTarget.state}
						className={styles.toolBtn}
					>
						<FaTrophy /> Достижения
					</Button>
				</div>

				{/* Starter Habits Prompt if empty */}
				{habits.length === 0 && (
					<div className={styles.emptyHabitsBanner}>
						<p>У вас пока нет активных привычек в трекере.</p>
						<button
							type="button"
							className={styles.seedHabitsBtn}
							onClick={handleSeedMayweatherHabits}
						>
							<GiBoxingGlove /> Загрузить режимные привычки бойца
						</button>
					</div>
				)}

				{/* Full Embedded DoHabit List Widget */}
				<div className={styles.embeddedHabitListWrapper}>
					<HabitList />
				</div>
			</section>
		</div>
	);
}
