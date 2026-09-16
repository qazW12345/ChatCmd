// Feature-scoped labels keep the rich-text renderer independent of the large app dictionary.
const labels = {
  document: 'Document', email: 'Email draft', recipient: 'Recipient', copy: 'Copy', copied: 'Copied',
  copyFailed: 'Could not copy. Select and copy the content manually.', code: 'Code', source: 'Source',
  fileSource: 'File source', missingSource: 'Only reference IDs are available; this transcript has no source links.',
  widget: 'Interactive content', missingWidget: 'View the original conversation; widget data is not included in this transcript.',
  unavailableLink: 'This transcript has no usable local link.', unavailableImage: 'Image URL unavailable',
  note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution',
  images: 'Images', links: 'Reference links', files: 'Reference files', products: 'Products', finance: 'Financial chart',
  weather: 'Weather', sports: 'Sports', video: 'Video', audio: 'Audio', map: 'Map', table: 'Data table', chart: 'Chart',
} as const;

export const richTextLabels = (_useAlternateLanguage: boolean) => labels;
export type RichTextLabels = ReturnType<typeof richTextLabels>;
