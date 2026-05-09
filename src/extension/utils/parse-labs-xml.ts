import type {
  EpicReaderBookData,
  EpicReaderBookPage,
  Star,
  StarType,
  StarContent,
  MultipleChoiceOption,
} from '../types'

export function parseLabsXml(xmlString: string): EpicReaderBookData {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml')

  const parserError = xmlDoc.querySelector('parsererror')
  if (parserError) {
    throw new Error('XML parsing failed: ' + parserError.textContent)
  }

  const bookOutline = xmlDoc.querySelector('book_outline')
  if (!bookOutline) {
    throw new Error('Invalid XML: missing <book_outline>')
  }

  const readingModule = bookOutline.querySelector('session reading_module')
  if (!readingModule) {
    throw new Error('Invalid XML: missing <reading_module>')
  }

  return {
    startVideo: parseVideoUrl(readingModule, 'intro_video'),
    endVideo: parseVideoUrl(readingModule, 'summary-video'),
    pages: parsePages(readingModule),
  }
}

function parseVideoUrl(parent: Element, tagName: string): { url: string } {
  const el = parent.querySelector(tagName)
  return { url: el?.getAttribute('url') || '' }
}

function parsePages(readingModule: Element): EpicReaderBookPage[] {
  const pages: EpicReaderBookPage[] = []
  const pageElements = readingModule.querySelectorAll('pages > page')

  pageElements.forEach((pageElement) => {
    const xmlPageNumber = parseInt(pageElement.getAttribute('number') || '0', 10)
    // page number conversion: (n-1)*2, except page 2 stays 2
    const actualPageNumber = xmlPageNumber === 2 ? 2 : (xmlPageNumber - 1) * 2

    const stars = parseStars(pageElement)
    pages.push({
      pageNumber: actualPageNumber,
      starCount: stars.length,
      stars,
    })
  })

  return pages
}

function parseStars(pageElement: Element): Star[] {
  const stars: Star[] = []
  const starElements = pageElement.querySelectorAll('star_items > star')

  starElements.forEach((starElement) => {
    const type = starElement.getAttribute('type') as StarType

    const coordinatesElement = starElement.querySelector('coordinates')
    const xPercent = parseFloat(coordinatesElement?.querySelector('x')?.textContent || '0')
    const yPercent = parseFloat(coordinatesElement?.querySelector('y')?.textContent || '0')

    stars.push({
      type,
      coordinates: { x: xPercent / 100, y: yPercent / 100 },
      content: parseStarContent(starElement, type),
    })
  })

  return stars
}

function parseStarContent(starElement: Element, type: StarType): StarContent {
  const content: StarContent = {}
  const el = starElement.querySelector('star_content')
  if (!el) return content

  switch (type) {
    case 'information':
      content.url = el.querySelector('url')?.textContent || ''
      content.paragraph = el.querySelector('paragraph')?.textContent || ''
      break
    case 'game':
      content.url = el.querySelector('url')?.textContent || ''
      break
    case 'multiple-choice':
      content.question = el.querySelector('question')?.textContent || ''
      content.options = parseOptions(el)
      break
    case 'puzzle':
      content.imageUrl = el.querySelector('url')?.textContent || ''
      break
    case 'flashcard':
      content.front = el.querySelector('front')?.textContent || ''
      content.back = el.querySelector('back')?.textContent || ''
      break
    case 'infographic':
      content.imageUrl = el.querySelector('url')?.textContent || ''
      break
  }

  return content
}

function parseOptions(starContentElement: Element): MultipleChoiceOption[] {
  const options: MultipleChoiceOption[] = []
  starContentElement.querySelectorAll('options > option').forEach((el) => {
    options.push({
      id: el.getAttribute('id') || '',
      text: el.textContent || '',
      isCorrect: el.getAttribute('isCorrect') === 'true',
    })
  })
  return options
}
