import { useState } from 'react';
import styles from './ClientProfilePage.module.css';
import { useFitnessStore, type FunctionalTestType } from '@entities/fitness';
import {
	FaIdCard,
	FaPhoneAlt,
	FaLock,
	FaCheckCircle,
	FaExclamationTriangle,
	FaHeartbeat,
	FaRulerVertical,
	FaWeightHanging,
	FaPlus
} from 'react-icons/fa';
import { GiBoxingGlove } from 'react-icons/gi';
import { toast } from 'sonner';

export function ClientProfilePage() {
	const profile = useFitnessStore((s) => s.profile);
	const tests = useFitnessStore((s) => s.tests);
	const requestPhoneOtp = useFitnessStore((s) => s.requestPhoneOtp);
	const verifyAndLinkCard = useFitnessStore((s) => s.verifyAndLinkCard);
	const otpMockCode = useFitnessStore((s) => s.otpMockCode);
	const isOtpSent = useFitnessStore((s) => s.isOtpSent);
	const isLinking = useFitnessStore((s) => s.isLinking);
	const otpError = useFitnessStore((s) => s.otpError);
	const recordTest = useFitnessStore((s) => s.recordTest);

	// Phone linking form state
	const [phoneInput, setPhoneInput] = useState('+998901234567');
	const [codeInput, setCodeInput] = useState('');
	const [showLinkingModal, setShowLinkingModal] = useState(false);

	// Test recording form state
	const [showTestModal, setShowTestModal] = useState(false);
	const [testType, setTestType] = useState<FunctionalTestType>('leg_strength');
	const [wallSit, setWallSit] = useState('75');
	const [squats, setSquats] = useState('45');
	const [balanceSec, setBalanceSec] = useState('40');
	const [balanceSide, setBalanceSide] = useState<'left' | 'right' | 'both'>('right');
	const [mobilityReach, setMobilityReach] = useState('15');
	const [enduranceSec, setEnduranceSec] = useState('180');
	const [heartRate, setHeartRate] = useState('130');
	const [painReported, setPainReported] = useState(false);
	const [painNotes, setPainNotes] = useState('');
	const [modifications, setModifications] = useState('');

	const isCardLinked = profile?.membership_status === 'active' && Boolean(profile?.membership_card_number);

	const handleRequestOtp = async (e: React.FormEvent) => {
		e.preventDefault();
		const ok = await requestPhoneOtp(phoneInput);
		if (ok) {
			toast.info('Код подтверждения отправлен');
		}
	};

	const handleVerifyOtp = async (e: React.FormEvent) => {
		e.preventDefault();
		const ok = await verifyAndLinkCard(codeInput);
		if (ok) {
			toast.success('Клубная карта FitBase успешно привязана!');
			setShowLinkingModal(false);
			setCodeInput('');
		}
	};

	const handleSaveTest = async (e: React.FormEvent) => {
		e.preventDefault();
		const today = new Date().toISOString().split('T')[0];

		const payload: any = {
			testType,
			testDate: today,
			painReported,
			painNotes: painReported ? painNotes : undefined,
			modifications: modifications.trim() || undefined
		};

		if (testType === 'leg_strength') {
			payload.wallSitSeconds = wallSit ? Number(wallSit) : undefined;
			payload.squatsReps = squats ? Number(squats) : undefined;
		} else if (testType === 'balance') {
			payload.balanceSeconds = Number(balanceSec);
			payload.balanceSide = balanceSide;
		} else if (testType === 'mobility') {
			payload.mobilityReachCm = Number(mobilityReach);
			payload.mobilityJoint = 'Плечи и позвоночник';
		} else if (testType === 'endurance') {
			payload.enduranceSeconds = Number(enduranceSec);
			payload.heartRateBpm = heartRate ? Number(heartRate) : undefined;
		}

		const ok = await recordTest(payload);
		if (ok) {
			toast.success('Результат теста успешно зафиксирован');
			setShowTestModal(false);
		} else {
			toast.error('Ошибка сохранения теста');
		}
	};

	return (
		<div className={styles.container}>
			{/* 1. Golden Mayweather Club Membership Card */}
			<section className={styles.cardSection}>
				<div className={styles.membershipCard}>
					<div className={styles.cardHeader}>
						<div className={styles.cardBrand}>
							<span className={styles.cardGoldText}>MAYWEATHER</span>
							<span className={styles.cardSubText}>BOXING + FITNESS</span>
						</div>
						<div className={styles.chip}>
							<div className={styles.chipLines} />
						</div>
					</div>

					<div className={styles.cardNumber}>
						{profile?.membership_card_number ?? 'MBF-••••-PENDING'}
					</div>

					<div className={styles.cardFooter}>
						<div className={styles.cardHolder}>
							<span className={styles.cardLabel}>АТЛЕТ</span>
							<span className={styles.cardValue}>
								{profile ? `${profile.first_name} ${profile.last_name}` : 'Floyd Member'}
							</span>
						</div>

						<div className={styles.cardExpiry}>
							<span className={styles.cardLabel}>ДЕЙСТВУЕТ ДО</span>
							<span className={styles.cardValue}>
								{profile?.membership_expires_at ?? '31.12.2026'}
							</span>
						</div>

						<div className={styles.cardBadge}>
							{isCardLinked ? (
								<span className={styles.statusActive}>
									<FaCheckCircle /> ACTIVE
								</span>
							) : (
								<span className={styles.statusPending}>
									<FaLock /> НЕ ПРИВЯЗАНА
								</span>
							)}
						</div>
					</div>

					<div className={styles.cardClubLocation}>
						{profile?.club_location ?? 'Mayweather Boxing + Fitness (Tashkent Central)'}
					</div>
				</div>
			</section>

			{/* 2. FitBase Account Linking Widget */}
			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<div className={styles.sectionTitle}>
						<FaIdCard className={styles.titleIcon} />
						<h2>Интеграция с клубной базой (FitBase)</h2>
					</div>
				</div>

				<div className={styles.linkingBox}>
					<div className={styles.linkingStatus}>
						{isCardLinked ? (
							<div className={styles.linkedNotice}>
								<FaCheckCircle className={styles.successIcon} />
								<div>
									<div className={styles.linkedTitle}>Клубная карта верифицирована</div>
									<div className={styles.linkedPhone}>
										Привязанный телефон: {profile.phone_number} (FitBase ID: {profile.fitbase_client_id})
									</div>
								</div>
							</div>
						) : (
							<div className={styles.unlinkedNotice}>
								<p>
									Для автоматического учёта бронирований и клубного контракта привяжите номер
									телефона через одноразовый SMS-код.
								</p>
								<button
									type="button"
									className={styles.linkActionBtn}
									onClick={() => setShowLinkingModal(true)}
								>
									<FaPhoneAlt /> Привязать номер FitBase
								</button>
							</div>
						)}
					</div>
				</div>
			</section>

			{/* 3. Client Biometrics & Boxing Level */}
			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<div className={styles.sectionTitle}>
						<GiBoxingGlove className={styles.titleIcon} />
						<h2>Антропометрия & Параметры</h2>
					</div>
				</div>

				<div className={styles.metricsGrid}>
					<div className={styles.metricCard}>
						<div className={styles.metricLabel}>
							<FaRulerVertical /> Рост
						</div>
						<div className={styles.metricVal}>
							{profile?.height_cm ?? 178} <span className={styles.metricUnit}>см</span>
						</div>
					</div>

					<div className={styles.metricCard}>
						<div className={styles.metricLabel}>
							<FaWeightHanging /> Вес
						</div>
						<div className={styles.metricVal}>
							{profile?.weight_kg ?? 76.5} <span className={styles.metricUnit}>кг</span>
						</div>
					</div>

					<div className={styles.metricCard}>
						<div className={styles.metricLabel}>
							<GiBoxingGlove /> Уровень
						</div>
						<div className={styles.metricValText}>
							{profile?.initial_fitness_level === 'advanced' ? 'Продвинутый' : 'Средний'}
						</div>
					</div>

					<div className={styles.metricCard}>
						<div className={styles.metricLabel}>Цель</div>
						<div className={styles.metricValText}>
							Бокс & Кондиция
						</div>
					</div>
				</div>
			</section>

			{/* 4. Functional Fitness Tests History & Add Test */}
			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<div className={styles.sectionTitle}>
						<FaHeartbeat className={styles.titleIcon} />
						<h2>Функциональные тесты</h2>
					</div>
					<button
						type="button"
						className={styles.addTestBtn}
						onClick={() => setShowTestModal(true)}
					>
						<FaPlus /> Пройти тест
					</button>
				</div>

				<div className={styles.testsList}>
					{tests.length === 0 ? (
						<div className={styles.emptyState}>Тесты ещё не проводились. Нажмите «Пройти тест».</div>
					) : (
						tests.map((t) => (
							<div key={t.id} className={styles.testItem}>
								<div className={styles.testItemHeader}>
									<span className={styles.testBadge}>
										{t.test_type === 'leg_strength' && '🦵 Сила ног'}
										{t.test_type === 'balance' && '⚖️ Баланс'}
										{t.test_type === 'mobility' && '🧘 Подвижность'}
										{t.test_type === 'endurance' && '🫀 Выносливость'}
									</span>
									<span className={styles.testDate}>{t.test_date}</span>
								</div>

								<div className={styles.testResultValues}>
									{t.test_type === 'leg_strength' && (
										<div>
											{t.wall_sit_seconds ? `Стульчик у стены: ${t.wall_sit_seconds} сек. ` : ''}
											{t.squats_reps ? `Приседания: ${t.squats_reps} повт.` : ''}
										</div>
									)}
									{t.test_type === 'balance' && (
										<div>
											Удержание на одной ноге: {t.balance_seconds} сек. ({t.balance_side === 'right' ? 'Правая нога' : 'Левая нога'})
										</div>
									)}
									{t.test_type === 'mobility' && (
										<div>
											Результат гибкости: +{t.mobility_reach_cm} см ({t.mobility_joint ?? 'Плечевой пояс'})
										</div>
									)}
									{t.test_type === 'endurance' && (
										<div>
											Время: {t.endurance_seconds} сек.
											{t.heart_rate_bpm ? ` | Пульс: ${t.heart_rate_bpm} уд/мин` : ''}
										</div>
									)}
								</div>

								{Boolean(t.pain_reported) && (
									<div className={styles.painAlert}>
										<FaExclamationTriangle /> Боль зафиксирована: {t.pain_notes || 'дискомфорт при нагрузке'}
									</div>
								)}

								{t.modifications && (
									<div className={styles.modNotes}>Модификация: {t.modifications}</div>
								)}
							</div>
						))
					)}
				</div>
			</section>

			{/* Modal: Account Linking with OTP & Session Token */}
			{showLinkingModal && (
				<div className={styles.modalOverlay} onClick={() => setShowLinkingModal(false)}>
					<div className={styles.modalBody} onClick={(e) => e.stopPropagation()}>
						<div className={styles.modalHeader}>
							<h3>Привязка клубной карты FitBase</h3>
							<button
								type="button"
								className={styles.modalClose}
								onClick={() => setShowLinkingModal(false)}
							>
								×
							</button>
						</div>

						{!isOtpSent ? (
							<form onSubmit={handleRequestOtp} className={styles.modalForm}>
								<p className={styles.modalDesc}>
									Введите номер телефона, указанный в договоре Mayweather Boxing + Fitness:
								</p>
								<div className={styles.inputGroup}>
									<label>Номер телефона</label>
									<input
										type="tel"
										value={phoneInput}
										onChange={(e) => setPhoneInput(e.target.value)}
										placeholder="+998901234567"
										required
										className={styles.textInput}
									/>
								</div>
								{otpError && <div className={styles.errorText}>{otpError}</div>}

								<button
									type="submit"
									disabled={isLinking}
									className={styles.modalSubmitBtn}
								>
									{isLinking ? 'Отправка...' : 'Получить код подтверждения'}
								</button>
							</form>
						) : (
							<form onSubmit={handleVerifyOtp} className={styles.modalForm}>
								<div className={styles.otpNotice}>
									<FaLock /> Код отправлен на номер <strong>{phoneInput}</strong>.
									{otpMockCode && (
										<div className={styles.mockCodeBanner}>
											[Тестовый код для локальной проверки]: <strong>{otpMockCode}</strong>
										</div>
									)}
								</div>

								<div className={styles.inputGroup}>
									<label>4-значный SMS-код</label>
									<input
										type="text"
										maxLength={6}
										value={codeInput}
										onChange={(e) => setCodeInput(e.target.value)}
										placeholder="7788"
										required
										className={styles.otpInput}
									/>
								</div>

								<div className={styles.securityPills}>
									<span>Защита от перебора: макс. 3 попытки</span>
									<span>Одноразовый сессионный токен</span>
								</div>

								{otpError && <div className={styles.errorText}>{otpError}</div>}

								<button
									type="submit"
									disabled={isLinking}
									className={styles.modalSubmitBtn}
								>
									{isLinking ? 'Проверка...' : 'Подтвердить и привязать'}
								</button>
							</form>
						)}
					</div>
				</div>
			)}

			{/* Modal: New Functional Test Form */}
			{showTestModal && (
				<div className={styles.modalOverlay} onClick={() => setShowTestModal(false)}>
					<div className={styles.modalBody} onClick={(e) => e.stopPropagation()}>
						<div className={styles.modalHeader}>
							<h3>Зафиксировать функциональный тест</h3>
							<button
								type="button"
								className={styles.modalClose}
								onClick={() => setShowTestModal(false)}
							>
								×
							</button>
						</div>

						<form onSubmit={handleSaveTest} className={styles.modalForm}>
							<div className={styles.inputGroup}>
								<label>Тип теста</label>
								<select
									value={testType}
									onChange={(e) => setTestType(e.target.value as FunctionalTestType)}
									className={styles.textInput}
								>
									<option value="leg_strength">Сила ног (Стульчик / Приседания)</option>
									<option value="balance">Баланс (Стойка на одной ноге)</option>
									<option value="mobility">Подвижность (Плечевой пояс / Наклон)</option>
									<option value="endurance">Выносливость (Степ-тест / Планка)</option>
								</select>
							</div>

							{/* Dynamic fields strictly enforced by SQL Check Constraint */}
							{testType === 'leg_strength' && (
								<div className={styles.dynamicFields}>
									<div className={styles.inputGroup}>
										<label>Стульчик у стены (секунды)</label>
										<input
											type="number"
											value={wallSit}
											onChange={(e) => setWallSit(e.target.value)}
											className={styles.textInput}
										/>
									</div>
									<div className={styles.inputGroup}>
										<label>Количество приседаний за 60с</label>
										<input
											type="number"
											value={squats}
											onChange={(e) => setSquats(e.target.value)}
											className={styles.textInput}
										/>
									</div>
								</div>
							)}

							{testType === 'balance' && (
								<div className={styles.dynamicFields}>
									<div className={styles.inputGroup}>
										<label>Время удержания баланса (секунды)</label>
										<input
											type="number"
											value={balanceSec}
											onChange={(e) => setBalanceSec(e.target.value)}
											required
											className={styles.textInput}
										/>
									</div>
									<div className={styles.inputGroup}>
										<label>Опорная нога</label>
										<select
											value={balanceSide}
											onChange={(e) => setBalanceSide(e.target.value as any)}
											className={styles.textInput}
										>
											<option value="right">Правая нога</option>
											<option value="left">Левая нога</option>
											<option value="both">Обе поочерёдно</option>
										</select>
									</div>
								</div>
							)}

							{testType === 'mobility' && (
								<div className={styles.dynamicFields}>
									<div className={styles.inputGroup}>
										<label>Результат теста на подвижность (см)</label>
										<input
											type="number"
											step="0.5"
											value={mobilityReach}
											onChange={(e) => setMobilityReach(e.target.value)}
											required
											className={styles.textInput}
										/>
									</div>
								</div>
							)}

							{testType === 'endurance' && (
								<div className={styles.dynamicFields}>
									<div className={styles.inputGroup}>
										<label>Длительность теста (секунды)</label>
										<input
											type="number"
											value={enduranceSec}
											onChange={(e) => setEnduranceSec(e.target.value)}
											className={styles.textInput}
										/>
									</div>
									<div className={styles.inputGroup}>
										<label>Пульс после теста (уд/мин)</label>
										<input
											type="number"
											value={heartRate}
											onChange={(e) => setHeartRate(e.target.value)}
											className={styles.textInput}
										/>
									</div>
								</div>
							)}

							<div className={styles.checkboxGroup}>
								<label className={styles.checkboxLabel}>
									<input
										type="checkbox"
										checked={painReported}
										onChange={(e) => setPainReported(e.target.checked)}
									/>
									<span>Возникла ли боль во время тестирования?</span>
								</label>
							</div>

							{painReported && (
								<div className={styles.inputGroup}>
									<label>Описание боли / дискомфорта</label>
									<textarea
										value={painNotes}
										onChange={(e) => setPainNotes(e.target.value)}
										placeholder="Локализация боли, характер, при каком угле движения..."
										className={styles.textArea}
									/>
								</div>
							)}

							<div className={styles.inputGroup}>
								<label>Модификации (если применялись)</label>
								<input
									type="text"
									value={modifications}
									onChange={(e) => setModifications(e.target.value)}
									placeholder="С опорой на стену / с облегчением веса..."
									className={styles.textInput}
								/>
							</div>

							<button type="submit" className={styles.modalSubmitBtn}>
								Сохранить тест
							</button>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
