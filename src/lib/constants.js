// 2026 勞保健保費率
export const INSURANCE_2026 = {
  // 勞保費率 12% (雇主70% 勞工20% 政府10%), 含就業保險1%
  LABOR_RATE: 0.12,
  LABOR_EMPLOYER_RATIO: 0.7,
  LABOR_EMPLOYEE_RATIO: 0.2,
  EMPLOYMENT_RATE: 0.01,
  // 健保費率 5.17% (雇主60% 勞工30% 政府10%), 平均眷口數 0.57
  HEALTH_RATE: 0.0517,
  HEALTH_EMPLOYER_RATIO: 0.6,
  HEALTH_EMPLOYEE_RATIO: 0.3,
  HEALTH_DEPENDENTS_AVG: 0.57,
  // 勞退 雇主提撥 6%
  PENSION_EMPLOYER_RATE: 0.06,
  // 投保薪資級距 (簡化版)
  SALARY_BRACKETS: [
    27470, 28800, 30300, 31800, 33300, 34800, 36300, 38200,
    40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400,
    57800, 60800, 63800, 66800, 69800, 72800, 76500, 80200,
    83900, 87600, 92100, 96600, 101100, 105600, 110100, 115500,
    120900, 126300, 131700, 137100, 142500, 147900, 150000
  ]
}

export const SHIFTS = {
  早班: { start: '12:00', end: '21:00', hours: 9 },
  晚班: { start: '15:00', end: '00:00', hours: 9 },
  休假: { start: null, end: null, hours: 0 },
}

export const LEAVE_TYPES = [
  { id: 'annual', name: '特休', paid: true },
  { id: 'personal', name: '事假', paid: false },
  { id: 'sick', name: '病假', paid: true, rate: 0.5 },
  { id: 'marriage', name: '婚假', paid: true },
  { id: 'funeral', name: '喪假', paid: true },
  { id: 'official', name: '公假', paid: true },
  { id: 'compensatory', name: '補休', paid: true },
]

export const STORE_LOCATION = {
  lat: 25.0269184,
  lng: 121.5419774,
  radius: 100, // meters
}

export const ROLES = {
  BOSS: 'boss',
  STAFF: 'staff',
}

// 計算投保薪資級距
export function getInsuranceBracket(salary) {
  const brackets = INSURANCE_2026.SALARY_BRACKETS
  for (const b of brackets) {
    if (salary <= b) return b
  }
  return brackets[brackets.length - 1]
}

// 計算勞保費 (員工自付)
export function calcLaborInsuranceEmployee(insuredSalary) {
  return Math.round(insuredSalary * (INSURANCE_2026.LABOR_RATE - INSURANCE_2026.EMPLOYMENT_RATE) * INSURANCE_2026.LABOR_EMPLOYEE_RATIO + insuredSalary * INSURANCE_2026.EMPLOYMENT_RATE * INSURANCE_2026.LABOR_EMPLOYEE_RATIO)
}

// 計算勞保費 (雇主)
export function calcLaborInsuranceEmployer(insuredSalary) {
  return Math.round(insuredSalary * (INSURANCE_2026.LABOR_RATE - INSURANCE_2026.EMPLOYMENT_RATE) * INSURANCE_2026.LABOR_EMPLOYER_RATIO + insuredSalary * INSURANCE_2026.EMPLOYMENT_RATE * INSURANCE_2026.LABOR_EMPLOYER_RATIO)
}

// 計算健保費 (員工自付)
export function calcHealthInsuranceEmployee(insuredSalary, dependents = 0) {
  return Math.round(insuredSalary * INSURANCE_2026.HEALTH_RATE * INSURANCE_2026.HEALTH_EMPLOYEE_RATIO * (1 + dependents))
}

// 計算健保費 (雇主)
export function calcHealthInsuranceEmployer(insuredSalary) {
  return Math.round(insuredSalary * INSURANCE_2026.HEALTH_RATE * INSURANCE_2026.HEALTH_EMPLOYER_RATIO * (1 + INSURANCE_2026.HEALTH_DEPENDENTS_AVG))
}

// 計算勞退 (雇主提撥)
export function calcPensionEmployer(salary) {
  return Math.round(salary * INSURANCE_2026.PENSION_EMPLOYER_RATE)
}
