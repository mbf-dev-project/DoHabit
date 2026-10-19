import { useState, useMemo } from 'react';
import styles from './WorkoutSchedulePage.module.css';
import { useFitnessStore } from '@entities/fitness';
import { FaClock, FaMapMarkerAlt, FaUserTie, FaFire, FaInfoCircle, FaCalendarAlt } from 'react-icons/fa';
import { GiBoxingGlove, GiWeightLiftingUp, GiRunningShoe } from 'react-icons/gi';

const DAYS_OF_WEEK = [
	{ label: 'Пн', offset: 0 },
	{ label: 'Вт', offset: 1 },
	{ label: 'Ср', offset: 2 },
	{ label: 'Чт', offset: 3 },
	{ label: 'Пт', offset: 4 },
	{ label: 'Сб', offset: 5 },
	{ label: 'Вс', offset: 6 }
];

export function WorkoutSchedulePage() {
	const schedule = useFitnessStore((s) => s.schedule);
	const [selectedDayOffset, setSelectedDayOffset] = useState<number>(0);
	const [categoryFilter, setCategoryFilter] = useState<'all' | 'boxing' | 'strength' | 'conditioning'>('all');

	// Compute selected date string YYYY-MM-DD
	const selectedDateStr = useMemo(() => {
		const d = new Date();
		d.setDate(d.getDate() + selectedDayOffset);
		return d.toISOString().split('T')[0];
	}, [selectedDayOffset]);

	// Filter classes for selected day and category (Read-only view)
	const filteredClasses = useMemo(() => {
		return schedule.filter((slot) => {
			const slotDay = slot.start_time.split('T')[0];
			const matchesDay = slotDay === selectedDateStr;
			const matchesCategory = categoryFilter === 'all' || slot.category === categoryFilter;
			return matchesDay && matchesCategory;
		});
	}, [schedule, selectedDateStr, categoryFilter]);

	const formatTime = (isoString: string) => {
		try {
			const date = new Date(isoString);
			return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '08:00';
		}
	};

	return (
		<div className={styles.container}>
			{/* Read-only Schedule Info Banner */}
			<section className={styles.readOnlyNotice}>
				<FaInfoCircle className={styles.noticeIcon} />
				<div className={styles.noticeText}>
					<span className={styles.noticeTitle}>Расписание тренировок FitBase</span>
					<span className={styles.noticeSubtitle}>
						Режим просмотра актуального клубного расписания Mayweather Boxing + Fitness.
					</span>
				</div>
			</section>

			{/* Day Selector Navigation */}
			<section className={styles.daysNav}>
				{DAYS_OF_WEEK.map((day) => {
					const dateObj = new Date();
					dateObj.setDate(dateObj.getDate() + day.offset);
					const dayNum = dateObj.getDate();
					const isSelected = selectedDayOffset === day.offset;

					return (
						<button
							key={day.offset}
							type="button"
							className={`${styles.dayBtn} ${isSelected ? styles.dayBtnActive : ''}`}
							onClick={() => setSelectedDayOffset(day.offset)}
						>
							<span className={styles.dayLabel}>{day.label}</span>
							<span className={styles.dayNum}>{dayNum}</span>
						</button>
					);
				})}
			</section>

			{/* Category Filter Pills */}
			<section className={styles.categoryFilters}>
				<button
					type="button"
					className={`${styles.filterPill} ${categoryFilter === 'all' ? styles.filterPillActive : ''}`}
					onClick={() => setCategoryFilter('all')}
				>
					Все
				</button>
				<button
					type="button"
					className={`${styles.filterPill} ${categoryFilter === 'boxing' ? styles.filterPillActive : ''}`}
					onClick={() => setCategoryFilter('boxing')}
				>
					<GiBoxingGlove /> Бокс
				</button>
				<button
					type="button"
					className={`${styles.filterPill} ${categoryFilter === 'strength' ? styles.filterPillActive : ''}`}
					onClick={() => setCategoryFilter('strength')}
				>
					<GiWeightLiftingUp /> Сила
				</button>
				<button
					type="button"
					className={`${styles.filterPill} ${categoryFilter === 'conditioning' ? styles.filterPillActive : ''}`}
					onClick={() => setCategoryFilter('conditioning')}
				>
					<GiRunningShoe /> Кондиция
				</button>
			</section>

			{/* Classes Schedule Feed (Read-Only) */}
			<section className={styles.classesList}>
				{filteredClasses.length === 0 ? (
					<div className={styles.emptyState}>
						<FaCalendarAlt className={styles.emptyIcon} />
						<p>На выбранную дату тренировок в расписании не найдено.</p>
					</div>
				) : (
					filteredClasses.map((item) => {
						const isFull = item.available_spots <= 0;

						return (
							<div key={item.id} className={styles.classCard}>
								<div className={styles.cardTop}>
									<div className={styles.timeBadge}>
										<FaClock />
										<span>
											{formatTime(item.start_time)} - {formatTime(item.end_time)}
										</span>
									</div>

									<div className={styles.intensityBadge}>
										<FaFire /> {item.intensity_level === 'high' ? 'HIGH INTENSITY' : 'MEDIUM'}
									</div>
								</div>

								<div className={styles.cardMain}>
									<h4 className={styles.classTitle}>{item.class_title}</h4>
									<div className={styles.classDetails}>
										<div className={styles.detailRow}>
											<FaUserTie className={styles.detailIcon} />
											<span>{item.trainer_name}</span>
										</div>
										<div className={styles.detailRow}>
											<FaMapMarkerAlt className={styles.detailIcon} />
											<span>{item.room}</span>
										</div>
									</div>
								</div>

								<div className={styles.cardBottom}>
									<div className={styles.spotsInfo}>
										<span className={styles.spotsCount}>
											{!isFull ? (
												<>Свободно <strong>{item.available_spots}</strong> из {item.total_spots} мест</>
											) : (
												<span className={styles.spotsFull}>Группа набрана</span>
											)}
										</span>
									</div>

									<div className={styles.readOnlyBadge}>
										<span>{item.duration_minutes} мин</span>
									</div>
								</div>
							</div>
						);
					})
				)}
			</section>
		</div>
	);
}
