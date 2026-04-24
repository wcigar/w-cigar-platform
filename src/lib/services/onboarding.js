// src/lib/services/onboarding.js
import { supabase } from '../supabase'

const USE_MOCK = true

export const PERSON_TYPES = {
  employee: '員工',
  ambassador: '雪茄大使',
  supervisor: '督導',
  warehouse: '總倉人員',
  hq_staff: 'HQ / Staff',
}

export const ONBOARDING_STATUSES = {
  draft: { label: '草稿', color: '#6b7280' },
  pending_documents: { label: '缺文件', color: '#f59e0b' },
  pending_review: { label: '待審核', color: '#3b82f6' },
  approved: { label: '已核准', color: '#14b8a6' },
  account_created: { label: '帳號已建', color: '#22c55e' },
  compensation_configured: { label: '薪資已設', color: '#10b981' },
  training: { label: '教育訓練中', color: '#c9a84c' },
  active: { label: '在職', color: '#22c55e' },
  rejected: { label: '已駁回', color: '#ef4444' },
  resigned: { label: '已離職', color: '#71717a' },
}

export async function listOnboardings(filter = {}) {
  if (USE_MOCK) return mockList
  const { data, error } = await supabase
    .from('staff_onboarding_profiles').select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function getOnboarding(id) {
  if (USE_MOCK) {
    return { ...mockList[0], documents: mockDocuments, tasks: mockTasks, provisioning: mockProvisioning }
  }
  const { data, error } = await supabase
    .from('staff_onboarding_profiles')
    .select('*, documents:staff_onboarding_documents(*), tasks:staff_onboarding_tasks(*), provisioning:staff_account_provisioning(*)')
    .eq('id', id).single()
  if (error) throw error
  return data
}

export async function createOnboarding(payload, actorId) {
  if (USE_MOCK) return { success: true, profile_id: 'onb-mock' }
  const { data, error } = await supabase.rpc('create_onboarding_profile', {
    payload, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

export async function provisionAccount(profileId, actorId) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('provision_staff_account', {
    p_profile_id: profileId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

export async function activateOnboarding(profileId, actorId) {
  if (USE_MOCK) return { success: true }
  const { data, error } = await supabase.rpc('activate_onboarding_profile', {
    p_profile_id: profileId, p_actor_id: actorId,
  })
  if (error) throw error
  return data
}

// ---------- mock ----------
const mockList = [
  { id: 'onb1', person_type: 'ambassador', name: '林小強', phone: '0912-345-678',
    start_date: '2026-05-01', status: 'pending_documents', assigned_role: 'ambassador' },
  { id: 'onb2', person_type: 'warehouse', name: '張倉管', phone: '0923-456-789',
    start_date: '2026-04-28', status: 'pending_review', assigned_role: 'warehouse' },
]
const mockDocuments = [
  { id: 'd1', document_type: 'id_card', status: 'uploaded' },
  { id: 'd2', document_type: 'bank_book', status: 'missing' },
  { id: 'd3', document_type: 'contract', status: 'missing' },
]
const mockTasks = [
  { id: 't1', task_type: 'collect_documents', title: '收集文件', status: 'in_progress' },
  { id: 't2', task_type: 'sign_contract', title: '簽訂合約', status: 'pending' },
  { id: 't3', task_type: 'create_account', title: '建立系統帳號', status: 'pending' },
  { id: 't4', task_type: 'configure_compensation', title: '設定薪資規則', status: 'pending' },
  { id: 't5', task_type: 'training', title: '教育訓練', status: 'pending' },
]
const mockProvisioning = []
