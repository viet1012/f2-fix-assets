import type { AssetsResponse, UploadResponse } from '../types/fixedAsset'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      typeof data?.error === 'string'
        ? data.error
        : `HTTP ${response.status}`

    throw new Error(message)
  }

  return data as T
}

export async function getAssets(): Promise<AssetsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/assets`)
  return readJson<AssetsResponse>(response)
}

export async function uploadExcel(file: File): Promise<UploadResponse> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body,
  })

  return readJson<UploadResponse>(response)
}

export async function uploadFromUrl(url: string): Promise<UploadResponse> {
  const response = await fetch(`${API_BASE_URL}/api/upload-from-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
  })

  return readJson<UploadResponse>(response)
}