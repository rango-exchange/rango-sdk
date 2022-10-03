import axios from 'axios'

export const httpService = axios.create({
  baseURL: 'https://api.rango.exchange',
})
