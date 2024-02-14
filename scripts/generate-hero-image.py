# DALL-E has been used to generate the "hero" image, just keeping the generation code for record
# You just need to:
# 1. Install `python`
# 2. Install globally the latest OpenAI library version (`pip install openai --upgrade`)
# 3. Set your OpenAI API key into `$OPENAI_API_KEY` (this is a paid service)
# 4. Run `python generate-hero-image.py` and wait for a few seconds
#
# Note: since it struggles to make a transparent background around the main items, I used https://www.photoroom.com/tools/background-remover to help as post-processing

from openai import OpenAI
import webbrowser
import os

client = OpenAI(api_key = os.getenv('OPENAI_API_KEY'))

# Call the API
response = client.images.generate(
  model="dall-e-3",
  prompt="une représentation vectorielle d'un établi avec des outils et des services publiques numériques représentés dessus, et un drapeau français estampillé sur un coin de l'établi, avec un effet de perspective (les outils doivent avoir un peu de couleurs). Tout ce qui est autour de l'établi doit être totalement transparent (format .png), on doit pouvoir distinguer le contenu aussi bien sur fond blanc que sur fond noir.",
  size="1024x1024",
  quality="standard",
  n=1,
)

# Show the result that has been pushed to an url
webbrowser.open(response.data[0].url)
