function Pandoc(doc)
  -- Iterate through the blocks in the document
  doc.blocks = filter_blocks(doc.blocks)
  return doc
end

function filter_blocks(blocks)
  local filtered_blocks = {}

  for _, block in ipairs(blocks) do
    -- Check if the block is not an Image or RawBlock element with SVG content
    if not (block.tag == "Image" or (block.tag == "RawBlock" and is_svg(block.text))) then
      if block.content and type(block.content) == "table" then
        -- Recursively process nested blocks
        block.content = filter_blocks(block.content)
      end

      -- Add the block to the filtered list if it doesn't match the criteria
      table.insert(filtered_blocks, block)
    end
  end

  return filtered_blocks
end

function is_svg(text)
  -- Check if the raw block text contains an SVG element
  return string.match(text, "<svg.-</svg>")
end
