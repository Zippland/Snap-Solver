from PIL import Image, ImageDraw

def create_icon():
    # Create a simple icon (a colored circle)
    icon_size = 64
    icon_image = Image.new('RGB', (icon_size, icon_size), color='white')
    draw = ImageDraw.Draw(icon_image)
    draw.ellipse([4, 4, icon_size-4, icon_size-4], fill='#2196F3')
    
    # Save as ICO file
    icon_image.save('app.ico', format='ICO')

if __name__ == '__main__':
    create_icon()
