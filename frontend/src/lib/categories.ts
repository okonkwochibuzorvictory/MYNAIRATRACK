import { apiFetch } from '../auth/client'

export interface Category {
  id: number
  name: string
  type: string
  is_default: boolean
  is_business: boolean
}

export interface CategoryForm {
  name: string
  type: string
  is_business?: boolean
}

export const EMPTY_CATEGORY_FORM: CategoryForm = { name: '', type: 'expense', is_business: false }

export function splitByType(categories: Category[]): { income: Category[]; expense: Category[] } {
  return {
    income: categories.filter((c) => c.type === 'income'),
    expense: categories.filter((c) => c.type === 'expense'),
  }
}

export function validateCategoryForm(form: CategoryForm): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!form.name.trim()) errors.name = 'Category name is required'
  else if (form.name.trim().length > 128) errors.name = 'Category name is too long'
  if (form.type !== 'income' && form.type !== 'expense')
    errors.type = 'Choose income or expense'
  return errors
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json()
    if (typeof data?.detail === 'string') return data.detail
    return `Request failed (${res.status})`
  } catch {
    return `Request failed (${res.status})`
  }
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch('/categories')
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Category[]
}

export async function createCategory(form: CategoryForm): Promise<Category> {
  const res = await apiFetch('/categories', {
    method: 'POST',
    body: JSON.stringify({ name: form.name.trim(), type: form.type, is_business: form.is_business }),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Category
}

export async function updateCategory(id: number, data: { name: string }): Promise<Category> {
  const res = await apiFetch(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as Category
}

export async function deleteCategory(id: number): Promise<void> {
  const res = await apiFetch(`/categories/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(await readError(res))
}
