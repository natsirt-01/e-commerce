import { useEffect, useState } from 'react'
import type { DeliveryAddress, LocationOption } from '../types'
import { api } from '../lib/api'

type Props = {
  value: DeliveryAddress
  onChange: (updates: Partial<DeliveryAddress>) => void
}

function formatDateAfterBusinessDays(days: number) {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const date = new Date(Date.UTC(Number(dateValues.year), Number(dateValues.month) - 1, Number(dateValues.day), 12))
  let remaining = days
  while (remaining > 0) {
    date.setUTCDate(date.getUTCDate() + 1)
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining -= 1
  }
  return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })
}

export function CentralLuzonAddressFields({ value, onChange }: Props) {
  const [provinces, setProvinces] = useState<LocationOption[]>([])
  const [provincesLoaded, setProvincesLoaded] = useState(false)
  const [citiesResult, setCitiesResult] = useState<{ provinceCode: string; items: LocationOption[] }>({ provinceCode: '', items: [] })
  const [barangaysResult, setBarangaysResult] = useState<{ cityCode: string; items: LocationOption[] }>({ cityCode: '', items: [] })
  const [zipCodesResult, setZipCodesResult] = useState<{ key: string; codes: string[] }>({ key: '', codes: [] })
  const [estimateResult, setEstimateResult] = useState<{ cityCode: string; days: number } | null>(null)
  const [locationError, setLocationError] = useState('')
  const cities = citiesResult.provinceCode === value.deliveryProvinceCode ? citiesResult.items : []
  const barangays = barangaysResult.cityCode === value.deliveryCityCode ? barangaysResult.items : []
  const zipKey = `${value.deliveryProvinceCode}:${value.deliveryCityCode}:${value.deliveryBarangayCode}`
  const zipCodes = zipCodesResult.key === zipKey ? zipCodesResult.codes : []
  const estimatedDays = estimateResult?.cityCode === value.deliveryCityCode ? estimateResult.days : null
  const loadingProvinces = !provincesLoaded
  const loadingCities = Boolean(value.deliveryProvinceCode) && citiesResult.provinceCode !== value.deliveryProvinceCode
  const loadingBarangays = Boolean(value.deliveryCityCode) && barangaysResult.cityCode !== value.deliveryCityCode
  const loadingZipCodes = Boolean(value.deliveryCityCode) && zipCodesResult.key !== zipKey

  useEffect(() => {
    const controller = new AbortController()
    api.getDeliveryProvinces(controller.signal).then((items) => {
      setProvinces(items)
    }).catch((reason) => {
      if (!controller.signal.aborted) setLocationError(reason instanceof Error ? reason.message : 'Unable to load Central Luzon provinces.')
    }).finally(() => {
      if (!controller.signal.aborted) setProvincesLoaded(true)
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!value.deliveryProvinceCode) return
    const controller = new AbortController()
    api.getDeliveryCities(value.deliveryProvinceCode, controller.signal).then((items) => {
      setCitiesResult({ provinceCode: value.deliveryProvinceCode, items })
    }).catch((reason) => {
      if (!controller.signal.aborted) setLocationError(reason instanceof Error ? reason.message : 'Unable to load cities and municipalities.')
    })
    return () => controller.abort()
  }, [value.deliveryProvinceCode])

  useEffect(() => {
    if (!value.deliveryCityCode) return
    const controller = new AbortController()
    api.getDeliveryBarangays(value.deliveryCityCode, controller.signal).then((items) => {
      setBarangaysResult({ cityCode: value.deliveryCityCode, items })
    }).catch((reason) => {
      if (!controller.signal.aborted) setLocationError(reason instanceof Error ? reason.message : 'Unable to load barangays.')
    })
    return () => controller.abort()
  }, [value.deliveryCityCode])

  useEffect(() => {
    if (!value.deliveryProvinceCode || !value.deliveryCityCode) return
    const controller = new AbortController()
    const key = `${value.deliveryProvinceCode}:${value.deliveryCityCode}:${value.deliveryBarangayCode}`
    api.getDeliveryZipCodes(value.deliveryProvinceCode, value.deliveryCityCode, value.deliveryBarangayCode, controller.signal).then((codes) => {
      setZipCodesResult({ key, codes })
      onChange({ deliveryZipCode: codes.length === 1 ? codes[0] : '' })
    }).catch((reason) => {
      if (!controller.signal.aborted) {
        setZipCodesResult({ key, codes: [] })
        setLocationError(reason instanceof Error ? reason.message : 'Unable to load ZIP codes.')
      }
    })
    api.getDeliveryEstimate(value.deliveryProvinceCode, value.deliveryCityCode, controller.signal).then(({ days }) => {
      setEstimateResult({ cityCode: value.deliveryCityCode, days })
    }).catch((reason) => {
      if (!controller.signal.aborted) setLocationError(reason instanceof Error ? reason.message : 'Unable to calculate the delivery estimate.')
    })
    return () => controller.abort()
  }, [value.deliveryProvinceCode, value.deliveryCityCode, value.deliveryBarangayCode, onChange])

  return (
    <fieldset className="delivery-address-fields">
      <legend>Delivery address</legend>
      <label>Region
        <select value="030000000" disabled aria-label="Delivery region">
          <option value="030000000">Central Luzon (Region III)</option>
        </select>
      </label>
      <label>Province
        <select required value={value.deliveryProvinceCode} disabled={loadingProvinces} onChange={(event) => {
          const province = provinces.find((item) => item.code === event.target.value)
          onChange({
            deliveryRegion: 'Central Luzon (Region III)',
            deliveryProvinceCode: province?.code || '',
            deliveryProvince: province?.name || '',
            deliveryCityCode: '',
            deliveryCity: '',
            deliveryBarangayCode: '',
            deliveryBarangay: '',
            deliveryZipCode: '',
          })
          setLocationError('')
        }}>
          <option value="">{loadingProvinces ? 'Loading provinces...' : 'Select province'}</option>
          {provinces.map((province) => <option key={province.code} value={province.code}>{province.name}</option>)}
        </select>
      </label>
      <label>City / Municipality
        <select required value={value.deliveryCityCode} disabled={!value.deliveryProvinceCode || loadingCities} onChange={(event) => {
          const city = cities.find((item) => item.code === event.target.value)
          onChange({ deliveryCityCode: city?.code || '', deliveryCity: city?.name || '', deliveryBarangayCode: '', deliveryBarangay: '', deliveryZipCode: '' })
          setLocationError('')
        }}>
          <option value="">{loadingCities ? 'Loading locations...' : 'Select city / municipality'}</option>
          {cities.map((city) => <option key={city.code} value={city.code}>{city.name}</option>)}
        </select>
      </label>
      <label>Barangay
        <select required value={value.deliveryBarangayCode} disabled={!value.deliveryCityCode || loadingBarangays} onChange={(event) => {
          const barangay = barangays.find((item) => item.code === event.target.value)
          onChange({ deliveryBarangayCode: barangay?.code || '', deliveryBarangay: barangay?.name || '', deliveryZipCode: '' })
          setLocationError('')
        }}>
          <option value="">{loadingBarangays ? 'Loading barangays...' : 'Select barangay'}</option>
          {barangays.map((barangay) => <option key={barangay.code} value={barangay.code}>{barangay.name}</option>)}
        </select>
      </label>
      <label>ZIP Code
        {zipCodes.length > 1 ? <select required value={value.deliveryZipCode} onChange={(event) => onChange({ deliveryZipCode: event.target.value })}>
          <option value="">Select ZIP code</option>
          {zipCodes.map((zipCode) => <option key={zipCode} value={zipCode}>{zipCode}</option>)}
        </select> : <input
          required
          type="text"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          value={value.deliveryZipCode}
          readOnly={zipCodes.length === 1}
          disabled={loadingZipCodes}
          onChange={(event) => onChange({ deliveryZipCode: event.target.value.replace(/\D/g, '').slice(0, 4) })}
          placeholder={loadingZipCodes ? 'Checking PHLPost...' : '4-digit ZIP code'}
        />}
        {!loadingZipCodes && !zipCodes.length && value.deliveryCityCode && <small className="field-help">Walang ZIP entry ang PHLPost para sa napiling lugar. Ilagay ang verified 4-digit ZIP code. <a href="https://phlpost.gov.ph/zip-code-locator/" target="_blank" rel="noreferrer">Check PHLPost</a>.</small>}
      </label>
      <label>House Number / Street / Subdivision
        <input required maxLength={300} value={value.deliveryStreetAddress} onChange={(event) => onChange({ deliveryStreetAddress: event.target.value })} placeholder="House number, street, subdivision" />
      </label>
      <label>Additional Address Details (Optional)
        <input maxLength={300} value={value.deliveryAdditionalDetails} onChange={(event) => onChange({ deliveryAdditionalDetails: event.target.value })} placeholder="Landmark, building, floor, etc." />
      </label>
      {locationError && <p className="field-error" role="alert">{locationError}</p>}
      {estimatedDays !== null && value.deliveryCityCode && <p className="delivery-estimate"><span>Estimated delivery</span><b>{estimatedDays} business days · around {formatDateAfterBusinessDays(estimatedDays)}</b></p>}
    </fieldset>
  )
}
