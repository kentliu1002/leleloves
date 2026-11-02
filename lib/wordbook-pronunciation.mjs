export function wordbookSpeechText(word) {
  return word.replace(/\bsb\b/gi, 'somebody').replace(/\bsth\b/gi, 'something').replace(/\s*\/\s*/g, ' or ')
}
