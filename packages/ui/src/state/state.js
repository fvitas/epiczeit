import { defaultPalettes } from '@ui/components/palette/colors.js'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import isEmpty from 'lodash/isEmpty.js'
import { decompressFromEncodedURIComponent } from 'lz-string'
import { proxy, subscribe, useSnapshot } from 'valtio'

dayjs.extend(utc)
dayjs.extend(timezone)

const searchParams = new URLSearchParams(location.search)

if (searchParams.get('share')) {
  try {
    const compressedStateString = decompressFromEncodedURIComponent(searchParams.get('share'))
    const { timezones, currentPalette } = JSON.parse(compressedStateString)

    localStorage.setItem(
      'epiczeit-state',
      JSON.stringify({
        currentTime: dayjs.utc(),
        showResetTime: false,
        timezones,
        currentPalette,
        previewPalette: null,
      }),
    )

    history.pushState({}, document.title, location.pathname)
  } catch {}
}

const storedStateString = localStorage.getItem('epiczeit-state') ?? '{}'
const storedState = JSON.parse(storedStateString)

let initialState = {
  currentTime: dayjs.utc(),
  showResetTime: false,
  timezones: [],
  currentPalette: defaultPalettes[0],
  previewPalette: null,
}

const state = proxy({
  ...initialState,
  ...storedState,

  currentTime:
    storedState.currentTime && storedState.showResetTime ? dayjs(storedState.currentTime).utc() : dayjs.utc(),
})

function getOffsetInMinutes(timezone, date = new Date()) {
  let formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
  })
  let [year, sign = '+', hour = 0, minutes = 0] = formatter.format(date).match(/\d+|\+|-/g)

  return Number(sign + 1) * (hour * 60 + Number(minutes ?? 0))
}

function addLocation(selectedLocation) {
  let newLocationOffset = getOffsetInMinutes(selectedLocation.timezone)
  let existingTimezone = state.timezones.find(tz => tz.offset === newLocationOffset)

  let newLocation = {
    id: crypto.randomUUID(),
    timezone: selectedLocation.timezone,
    label: selectedLocation.name,
    countryCode: selectedLocation.country_code,
  }

  if (existingTimezone) {
    existingTimezone.locations.push(newLocation)
  } else {
    state.timezones.push({
      offset: getOffsetInMinutes(selectedLocation.timezone),
      isHome: state.timezones.length === 0,
      locations: [newLocation],
    })

    state.timezones = state.timezones.toSorted((a, b) => a.offset - b.offset)
  }
}

function deleteLocation(deletedLocation) {
  let changedTimezone = state.timezones.find(timezone =>
    timezone.locations.find(location => location.id === deletedLocation.id),
  )
  changedTimezone.locations = changedTimezone.locations.filter(location => location.id !== deletedLocation.id)

  if (isEmpty(changedTimezone.locations)) {
    deleteTimezone(changedTimezone)
  }
}

function editLocation(location, newLabel) {
  let changedLocation = state.timezones.flatMap(timezone => timezone.locations).find(l => l.id === location.id)
  changedLocation.label = newLabel
}

function editTimezoneTime(timezone, hours, minutes = '00', amPm = '') {
  let timezoneName = timezone.locations[0].timezone
  let newHours = Number(hours)

  if (amPm) {
    if (amPm === 'pm') {
      newHours = Number(hours) + 12
    }

    if (hours === '12' && amPm === 'am') {
      newHours = 0
    }

    if (hours === '12' && amPm === 'pm') {
      newHours = 12
    }
  }
  let newMinutes = Number(minutes)

  let currentTimezoneDate = state.currentTime.tz(timezoneName).format('YYYY-MM-DD')
  let newTime = dayjs.tz(`${currentTimezoneDate} ${newHours}:${newMinutes}`, timezoneName).utc()

  state.showResetTime = dayjs.utc().format('HH:mm') !== newTime.utc().format('HH:mm')
  state.currentTime = newTime
}

function deleteTimezone(deletedTimezone) {
  state.timezones = state.timezones.filter(timezone => timezone.offset !== deletedTimezone.offset)

  if (isEmpty(state.timezones)) {
    resetTime()
  }
}

function resetTime() {
  state.showResetTime = false
  state.currentTime = dayjs().utc()
}

function changeHome(homeTimezone) {
  state.timezones.forEach(timezone => {
    timezone.isHome = timezone.offset === homeTimezone.offset
  })
}

function setPreviewPalette(newPalette) {
  state.previewPalette = newPalette
}

function savePalette() {
  if (state.previewPalette) {
    state.currentPalette = state.previewPalette
  }
  state.previewPalette = null
}

function discardPalette() {
  state.previewPalette = null
}

function reversePreviewPalette() {
  if (state.previewPalette && !state.previewPalette.isDynamic) {
    state.previewPalette.colors.reverse()
  }
}

export const actions = {
  addLocation: addLocation,
  deleteLocation: deleteLocation,
  editLocation: editLocation,
  editTimezoneTime: editTimezoneTime,
  deleteTimezone: deleteTimezone,
  resetTime: resetTime,
  changeHome: changeHome,

  // palettes actions
  setPreviewPalette: setPreviewPalette,
  savePalette: savePalette,
  discardPalette: discardPalette,
  reversePreviewPalette: reversePreviewPalette,
}

export function useEpicZeitState() {
  return useSnapshot(state)
}

export function useHomeTimezone() {
  const { timezones } = useSnapshot(state)

  return timezones.find(timezone => timezone.isHome)
}

addEventListener('beforeunload', () => {
  state.previewPalette = null
})

addEventListener('focus', () => {
  if (!state.showResetTime) {
    state.currentTime = dayjs().utc()
  }
})

setInterval(() => {
  if (!state.showResetTime) {
    const newTimeString = dayjs.utc().format('HH mm')
    const currentTimeString = dayjs.utc(state.currentTime).format('HH mm')

    if (newTimeString !== currentTimeString) {
      state.currentTime = dayjs().utc()
    }
  }
}, 5_000)

subscribe(state, () => {
  localStorage.setItem('epiczeit-state', JSON.stringify(state))
})
