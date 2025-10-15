export function convert_tags_to_array(tags: string | null) {
  if (tags && tags !== '') {
    return tags.split(',')
  } else {
    return []
  }
}

export function convert_tags_to_string(tags: string[]) {
  if (tags && tags.length > 0) {
    return tags.join(',')
  } else {
    return null
  }
}
