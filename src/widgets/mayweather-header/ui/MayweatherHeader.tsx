import styles from './MayweatherHeader.module.css';
import { useFitnessStore } from '@entities/fitness';
import { FaUserCircle, FaCalendarAlt, FaFire, FaPlus } from 'react-icons/fa';
import { Button } from '@shared/ui';
import { getNavigationTarget } from '@shared/lib/router';
import { t } from 'i18next';

export function MayweatherHeader() {
	const activeTab = useFitnessStore((s) => s.activeTab);
	const setActiveTab = useFitnessStore((s) => s.setActiveTab);
	const profile = useFitnessStore((s) => s.profile);

	const habitEditorTarget = getNavigationTarget('HABIT_EDITOR', {
		modalTitle: t('habits.actions.createNew')
	});

	return (
		<header className={styles.header}>
			<div className={styles.topRow}>
				<div className={styles.brand}>
					<div className={styles.badge}>MBF</div>
					<div>
						<h1 className={styles.title}>MAYWEATHER</h1>
						<span className={styles.subtitle}>BOXING + FITNESS</span>
					</div>
				</div>

				<div className={styles.headerActions}>
					<Button
						to={habitEditorTarget.to}
						state={habitEditorTarget.state}
						className={styles.addHabitBtn}
						title="Добавить привычку"
					>
						<FaPlus />
					</Button>
				</div>
			</div>

			<nav className={styles.tabsNav}>
				<button
					type="button"
					className={`${styles.tabBtn} ${activeTab === 'profile' ? styles.tabActive : ''}`}
					onClick={() => setActiveTab('profile')}
				>
					<FaUserCircle className={styles.tabIcon} />
					<span>Кабинет</span>
					{profile?.membership_status === 'active' && <span className={styles.activeDot} />}
				</button>

				<button
					type="button"
					className={`${styles.tabBtn} ${activeTab === 'schedule' ? styles.tabActive : ''}`}
					onClick={() => setActiveTab('schedule')}
				>
					<FaCalendarAlt className={styles.tabIcon} />
					<span>Расписание</span>
				</button>

				<button
					type="button"
					className={`${styles.tabBtn} ${activeTab === 'plan' ? styles.tabActive : ''}`}
					onClick={() => setActiveTab('plan')}
				>
					<FaFire className={styles.tabIcon} />
					<span>План & Привычки</span>
				</button>
			</nav>
		</header>
	);
}
