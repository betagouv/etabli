#!/bin/bash

# Find all ".docx" files in the directory "./src/"
find src -iname "*.docx" | while read -r file; do
  echo "File to transform: $file"

  base_dir=$(dirname "$file")

  # Apply transformers
  # Note: we don't go from "docx" format to "html", we stop by "mardown" to make sure it tries to keep a simple structure from the "docx"
  # so here we have 2 different pandoc commands concatenated :)
  pandoc -f docx -t gfm-raw_html "$file" --wrap=none | pandoc --quiet -f gfm-raw_html -t html5 --lua-filter "./scripts/legal-documents/pandoc-dsfr-adapter.lua" -o "$base_dir/content.transformed.html" --template="./scripts/legal-documents/pandoc-html-template.html" --wrap=none

  if [ $? -eq 0 ]; then
    echo "Transformation succeeded"
  else
    echo "Transformation failed"
  fi
done
