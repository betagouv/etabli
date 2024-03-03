-- This filter is targeting inline file content into pages (for now we target only images no matter if not an inlined data source)
-- which is by default kept by the markdown converter, resulting in too many tokens
-- for the llm system to process, whereas not meaningful for the purpose we use it
-- Note: maybe it should be applied to other tags like `<object>`? Will see if some others are passing through the markdown conversion

function Image (elem)
  elem.src = ''

  return elem
end
