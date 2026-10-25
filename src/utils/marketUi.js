import { useCallback, useMemo } from 'react'
import axios from 'axios'
import { formatContractDate, formatContractMoney } from './rentalContract.js'

export const formatMoney = formatContractMoney
export const formatDate = formatContractDate

export function formatDateTime(value) {
  return formatContractDate(value, true)
}

const authHeaders = () => ({ Authorization: `Bearer ${sessionStorage.getItem('token')}` })

export function errorMessage(error, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง') {
  return error?.response?.data?.message || fallback
}

export function useMarketApi(apiBase) {
  const request = useCallback(async (method, path, data, config = {}) => {
    const response = await axios.request({
      method,
      url: `${apiBase}${path}`,
      data,
      ...config,
      headers: { ...authHeaders(), ...config.headers },
    })
    return response.data
  }, [apiBase])
  return useMemo(() => ({
    get: (path, config) => request('get', path, undefined, config),
    post: (path, data, config) => request('post', path, data, config),
    put: (path, data) => request('put', path, data),
    patch: (path, data) => request('patch', path, data),
    del: (path) => request('delete', path),
  }), [request])
}

export function numberOrEmpty(value) {
  return value === null || value === undefined ? '' : String(value)
}
