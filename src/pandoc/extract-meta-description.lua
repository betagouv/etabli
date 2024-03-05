-- extract_meta_description.lua

function Pandoc(doc)
  -- Extract the meta description content
  local meta_description = extract_meta_description(doc.meta)

  -- Insert the meta description content into the body
  if meta_description then
    -- Make it strong so it has more value when inspected
    local new_block = pandoc.Strong(meta_description)
    table.insert(doc.blocks, 1, new_block)
  end

  return doc
end

function extract_meta_description(meta)
  -- Look for the meta description in the metadata
  if meta and meta.description then
    -- Pandoc is returning an array for some meta tags (including the description one)
    if type(meta.description) == "table" and #meta.description > 0 then
      return meta.description[1]
    end
  end

  return nil
end
