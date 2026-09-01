import fitz

pdf = fitz.open("/Users/abdulrehman/Downloads/Zeenat_Riaz_CV.pdf")  # apna path
page = pdf[0]
text_dict = page.get_text("dict")

for block in text_dict["blocks"]:
    if block["type"] != 0:
        continue
    block_text = "".join(s["text"] for l in block["lines"] for s in l["spans"])
    if "Johary" in block_text:
        for i, line in enumerate(block["lines"]):
            print(f"--- line {i} ---")
            spans = line["spans"]
            for j, s in enumerate(spans):
                print(f"  span {j}: text='{s['text']}' bbox={s['bbox']} size={s['size']}")
            for j in range(1, len(spans)):
                gap = spans[j]["bbox"][0] - spans[j-1]["bbox"][2]
                print(f"  gap between span {j-1} and {j}: {gap:.2f}")