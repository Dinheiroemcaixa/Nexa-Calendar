from PIL import Image
import os

input_path = os.path.join("src", "assets", "logo-dinheiro.png")
output_path = os.path.join("src", "assets", "logo-dinheiro-transparent.png")

img = Image.open(input_path).convert("RGBA")
data = img.getdata()

new_data = []
threshold = 230  # pixels quase brancos viram transparentes
for item in data:
    # Se R, G e B são todos altos (branco ou quase branco), torna transparente
    if item[0] > threshold and item[1] > threshold and item[2] > threshold:
        new_data.append((255, 255, 255, 0))  # transparente
    else:
        new_data.append(item)

img.putdata(new_data)
img.save(output_path, "PNG")
print(f"Imagem salva em: {output_path}")
print(f"Tamanho original: {os.path.getsize(input_path)} bytes")
print(f"Tamanho novo: {os.path.getsize(output_path)} bytes")
