import axios from 'axios'

const baseURL =
  typeof process !== 'undefined' && process.env.REACT_APP_RANGO_BASE_URL
    ? process.env.REACT_APP_RANGO_BASE_URL
    : 'https://api.rango.exchange'

export const httpService = axios.create({
  baseURL,
})
