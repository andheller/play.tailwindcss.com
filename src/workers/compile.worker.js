import { toValidTailwindVersion } from '../utils/toValidTailwindVersion'
import { processCss } from './processCss'
import { parseConfig } from './parseConfig'

self.BUILD_ID = 0

let current

let lastHtml
let lastCss
let lastConfig
let tailwindVersion = '2'

addEventListener('message', async (event) => {
  if (event.data._current) {
    current = event.data._current
    return
  }

  const html = event.data._recompile ? lastHtml : event.data.html
  const css = event.data._recompile ? lastCss : event.data.css
  const config = event.data._recompile ? lastConfig : event.data.config
  if ('tailwindVersion' in event.data) {
    tailwindVersion = toValidTailwindVersion(event.data.tailwindVersion)
  }

  if (css !== lastCss || config !== lastConfig) {
    self.BUILD_ID++
  }

  let buildId = self.BUILD_ID

  lastHtml = html
  lastCss = css
  lastConfig = config

  function respond(data) {
    setTimeout(() => {
      if (event.data._id === current) {
        postMessage({ _id: event.data._id, ...data })
      } else {
        postMessage({ _id: event.data._id, canceled: true })
      }
    }, 0)
  }

  let configOrError = await parseConfig(config, tailwindVersion)

  if (configOrError._error) {
    return respond({
      error: {
        message: configOrError._error.message,
        file: 'Config',
        line:
          typeof configOrError._error.line === 'undefined'
            ? undefined
            : configOrError._error.line,
      },
    })
  }

  try {
    const {
      css: compiledCss,
      html: compiledHtml,
      state,
      jit,
    } = await processCss(
      configOrError,
      html,
      css,
      tailwindVersion,
      event.data.skipIntelliSense
    )
    respond({ state, css: compiledCss, html: compiledHtml, jit, buildId })
  } catch (error) {
    console.log(error)
    if (error.toString().startsWith('CssSyntaxError')) {
      const match = error.message.match(
        /^<css input>:([0-9]+):([0-9]+): (.*?)$/
      )
      respond({ error: { message: match[3], file: 'CSS', line: match[1] } })
    } else {
      respond({ error: { message: error.message } })
    }
  }
})
