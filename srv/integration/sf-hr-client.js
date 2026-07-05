/**
 * SuccessFactors HR client — employee lookup via OData V2.
 *
 * Same integration NADEC Visitor-Gate uses:
 *   - Production : BTP Destination Service (default name "SF_PRD_Raw",
 *                  override with env SF_DESTINATION_NAME).
 *   - Local dev  : direct Basic-auth when SF_API_URL / SF_USERNAME / SF_PASSWORD
 *                  are set in a .env file. Otherwise these calls simply return
 *                  null and the caller falls back gracefully (no crash offline).
 *
 * Used by AuthService.xsuaaLogin to resolve a signed-in employee's real name on
 * first sign-in (the "username comes from SuccessFactors" requirement).
 */

const DESTINATION_NAME = process.env.SF_DESTINATION_NAME || 'SF_PRD_Raw'

const SF_API_URL = process.env.SF_API_URL || ''
const SF_USERNAME = process.env.SF_USERNAME || ''
const SF_PASSWORD = process.env.SF_PASSWORD || ''
const USE_DIRECT = !!(SF_API_URL && SF_USERNAME && SF_PASSWORD)

class SFHRClient {
  static async _httpGet(url) {
    if (USE_DIRECT) {
      const axios = require('axios')
      const auth = Buffer.from(`${SF_USERNAME}:${SF_PASSWORD}`).toString('base64')
      return axios.get(`${SF_API_URL}${url}`, {
        headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
        timeout: 15000
      })
    }
    // Production: resolve + call the bound BTP destination.
    const { executeHttpRequest } = require('@sap-cloud-sdk/http-client')
    return executeHttpRequest({ destinationName: DESTINATION_NAME }, { method: 'GET', url })
  }

  static _mapUser(u) {
    return {
      userId: u.userId,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      department: u.department,
      jobTitle: u.title || u.jobTitle || ''
    }
  }

  static async lookupById(employeeId) {
    if (!employeeId) return null
    try {
      const url = `/odata/v2/User('${employeeId}')?$select=userId,firstName,lastName,email,department,title&$format=json`
      const res = await this._httpGet(url)
      const u = res.data && res.data.d
      return u ? this._mapUser(u) : null
    } catch (e) {
      console.error('[SFHR] lookupById failed:', e.response && e.response.status, e.message)
      return null
    }
  }

  static async searchByName(query) {
    if (!query || query.length < 2) return []
    try {
      const q = String(query).replace(/'/g, "''")
      const url = `/odata/v2/User?$filter=substringof('${q}',firstName) or substringof('${q}',lastName) or substringof('${q}',userId)&$select=userId,firstName,lastName,email,department,title&$top=20&$format=json`
      const res = await this._httpGet(url)
      const results = res.data && res.data.d && res.data.d.results
      return (results || []).map((u) => this._mapUser(u))
    } catch (e) {
      console.error('[SFHR] searchByName failed:', e.response && e.response.status, e.message)
      return []
    }
  }
}

module.exports = SFHRClient
