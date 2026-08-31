import pymupdf4llm
md = pymupdf4llm.to_markdown("/Users/abdulrehman/Downloads/df.pdf")
print("LENGTH:", len(md))
print(repr(md[:500]))

for i, d in enumerate(page.get_drawings()):
    print(f"--- drawing {i} ---")
    print("fill:", d.get("fill"))
    print("color:", d.get("color"))
    print("fill_opacity:", d.get("fill_opacity"))
    for item in d["items"]:
        print("  item:", item[0], item[1] if len(item) > 1 else None)