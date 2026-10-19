import styles from './MainPage.module.css';
import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { pageMotionProps } from '../model/page.animations';
import { MayweatherHeader } from '@widgets/mayweather-header';
import { useFitnessStore } from '@entities/fitness';
import { ClientProfilePage } from '@pages/client-profile';
import { WorkoutSchedulePage } from '@pages/workout-schedule';
import { WeeklyPlanPage } from '@pages/weekly-plan';
import { WelcomeView } from '@widgets/welcome-view';
import { useSettingsStore } from '@entities/settings';

function MainPage() {
	const { hasSeenWelcome } = useSettingsStore((s) => s.settings);
	const activeTab = useFitnessStore((s) => s.activeTab);
	const loadAllData = useFitnessStore((s) => s.loadAllData);

	useEffect(() => {
		loadAllData();
	}, [loadAllData]);

	// 1. Render onboarding screen for first-time users
	if (!hasSeenWelcome) {
		return <WelcomeView />;
	}

	// 2. Render Mayweather Client Fitness interface
	return (
		<motion.div
			className={styles.mainPage}
			{...pageMotionProps}
		>
			<MayweatherHeader />

			<div className={styles.content}>
				{activeTab === 'profile' && <ClientProfilePage />}
				{activeTab === 'schedule' && <WorkoutSchedulePage />}
				{activeTab === 'plan' && <WeeklyPlanPage />}
			</div>
		</motion.div>
	);
}

export { MainPage };