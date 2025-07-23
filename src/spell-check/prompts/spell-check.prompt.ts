export const name = "Kiểm tra chính tả"
export const dentalTerms = [
  "periodontal", "gingivitis", "periodontitis", "amalgam", "composite", "porcelain", "zirconia",
  "orthodontic", "aligners", "SureSmile", "DMD", "CBCT", "Primescan", "Kavo", "Digidoc", "Solea Laser",
  "VHF E5 Mill", "Primeprint", "Asiga", "osseointegration", "bruxism", "halitosis", "malocclusion",
  "endodontics", "prosthodontics", "pediatric dentistry", "oral surgery", "maxillofacial",
  "restorative dentistry", "cosmetic dentistry", "dental implants", "dental bonding", "crowns",
  "bridgework", "dental fillings", "oral cancer screenings", "teeth cleanings", "removable dentures",
  "root canal treatment", "dental sealants", "tooth extractions", "fluoride", "plaque", "tartar",
  "enamel", "dentin", "pulp", "cementum", "gingiva", "alveolar bone", "TMJ", "apicoectomy",
  "gingivectomy", "frenectomy", "occlusion", "anesthesia", "sedation", "nitrous oxide", "biocompatible",
  "radiography", "panoramic", "cephalometric", "bitewing", "periapical", "intraoral", "extraoral",
  "sterilization", "autoclave", "aseptic", "cross-contamination", "HIPAA", "CareCredit", "Patient Honey"
];

export const getStrictDentalSpellCheckPrompt = (text: string): string => {
  const jsonStart = '```json\n';
  const jsonEnd = '\n```';

  let prompt = "**IMPORTANT: ONLY RETURN JSON. DO NOT INCLUDE ANY OTHER TEXT OR EXPLANATIONS.**\n\n" +
               "You are an AI assistant that strictly checks **English spelling errors** in **dental and medical content**.\n\n" +
               "Follow these instructions carefully:\n\n" +
               "--- \n\n" +
               "### 🔍 What to check:\n" +
               "- Spelling mistakes **only** (do NOT check grammar, formatting, or capitalization)\n" +
               "- Detect **merged or compound words** (e.g., \"dentalimplant\")\n" +
               "- Detect **invalid plural forms** (e.g., \"implantss\", \"crownns\", \"teeths\")\n" +
               "- Check for **inconsistent information** across the text regarding:\n" +
               "  - **Address**: Must be consistent in format and content. Check for:\n" +
               "    - Different street numbers or names in the same address\n" +
               "    - Inconsistent ward/district/city names\n" +
               "    - Different postal codes for the same location\n" +
               "  - **Phone numbers**: Must follow standard format and be consistent. Check for:\n" +
               "    - Different phone numbers for the same location/contact\n" +
               "    - Inconsistent country/area codes (e.g., +84 vs 84 vs 0 for Vietnam)\n" +
               "    - Invalid phone number formats\n" +
               "  - **Working hours**: Must be logical and consistent. Check for:\n" +
               "    - Overlapping or impossible time ranges (e.g., open at 14:00 but close at 12:00)\n" +
               "    - Inconsistent operating days\n" +
               "    - Different working hours for the same location on the same day\n" +
               "  - **Pricing**: If mentioned, must be consistent. Check for:\n" +
               "    - Different prices for the same service\n" +
               "    - Inconsistent currency formats\n" +
               "- **Contact Information**: Must be consistent across all pages. Check for:\n" +
               "  - Different email addresses for the same contact\n" +
               "  - Inconsistent social media handles\n" +
               "- **Business Information**: Must be consistent. Check for:\n" +
               "  - Different business names\n" +
               "  - Inconsistent service descriptions\n" +
               "- Ignore domain names like \"example.com\" or \"patienthoney.com\"\n" +
               "- Treat the following dental terms as correct:\n" +
               "  ✅ " + dentalTerms.join(', ') + "\n\n" +
               "--- \n\n" +
               "### 📤 Output Format (IMPORTANT - STRICTLY FOLLOW THIS):\n" +
               "Return the result **ONLY** as a valid JSON array, enclosed within a markdown code block (" + jsonStart + "...\n" + jsonEnd + "). **DO NOT** include any explanations, extra text, or conversational filler outside of this JSON block. If there are **no spelling mistakes**, return exactly: " + jsonStart + "[{\n\"errorWord\": \"\",\n\"originalSentence\": \"\",\n\"correctedSentence\": \"\",\n\"offset\": 0,\n\"message\": \"Không phát hiện lỗi chính tả.\"\n}]" + jsonEnd + "\n\n" +
               "Each object in the array must include:\n\n" +
               "- \"errorWord\": the incorrect word (English)\n" +
               "- \"originalSentence\": full sentence where the error appears\n" +
               "- \"correctedSentence\": the sentence after correcting the spelling\n" +
               "- \"offset\": character index where the error starts (in the full input)\n" +
               "- \"message\": short explanation in **Vietnamese** why it's incorrect\n" +
               "- \"inconsistencyType\": (optional) type of inconsistency if applicable (e.g., \"address\", \"phone\", \"hours\", \"pricing\", \"contact\")\n" +
               "- \"severity\": (optional) severity level (\"low\", \"medium\", \"high\") based on impact\n\n" +
               "--- \n\n" +
               "### ✅ Example output (STRICTLY FOLLOW THIS FORMAT):\n\n" +
               jsonStart + "\n" +
               "[\n" +
               "  {\n" +
               "    \"errorWord\": \"implantss\",\n" +
               "    \"originalSentence\": \"We provide high-quality implantss for patients.\",\n" +
               "    \"correctedSentence\": \"We provide high-quality implants for patients.\",\n" +
               "    \"offset\": 28,\n" +
               "    \"message\": \"Từ bị sai chính tả – dạng số nhiều không hợp lệ.\"\n" +
               "  }\n" +
               "]\n" +
               jsonEnd + "\n\n" +
               "--- \n\n" +
               "Now, analyze the following text line by line (each line is a sentence). Be strict.\n\n" +
               "--- \n\n" +
               text;
  return prompt;
};