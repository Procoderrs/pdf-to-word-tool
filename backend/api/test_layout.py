import fitz

pdf = fitz.open("/Users/abdulrehman/Downloads/Zeenat_Riaz_CV.pdf")  # apna actual CV path daalo
page = pdf[0]

print("=== Drawings (vector lines/rects) ===")
for i, d in enumerate(page.get_drawings()):
    print(f"--- drawing {i} ---")
    print("fill:", d.get("fill"))
    print("color:", d.get("color"))
    print("width:", d.get("width"))
    for item in d["items"]:
        print("  item:", item)