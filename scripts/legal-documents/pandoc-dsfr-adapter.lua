-- The DSFR structure is like that
function wrapTableWithDiv(elem)
  if elem.t == 'Table' then
    local div = pandoc.Div({ pandoc.RawBlock("html", '<div class="fr-table">') })
    div.content:insert(elem)
    div.content:insert(pandoc.RawBlock("html", '</div>'))

    return div
  end
  return elem
end

-- In some cases during transformations there are `<p>` inside `<li>` which makes the rendering weird
-- (it's easier to add this filter than requires people to write correctly into the initial `.docx`)
-- (also note we were note able to target `<li>` directly, we had to go through the `<ul>`)
function removeParagraphFromListItems(elem)
  if elem.tag == "BulletList" then
    local new_items = {}

    -- `listItem` is directly the `<li>` and cannot retrieve `listItem.content` (it's directly an array of nodes)
    for _, listItem in ipairs(elem.content) do
      local new_content = {}

      for _, child in ipairs(listItem) do
        if child.tag == "Para" then
          for _, subelem in ipairs(child.content) do
            table.insert(new_content, subelem)
          end
        else
          table.insert(new_content, child)
        end
      end

      table.insert(new_items, new_content)
    end

    elem.content = new_items
  end

  return elem
end

return {
  {
    Table = wrapTableWithDiv,
    BulletList = removeParagraphFromListItems
  }
}
