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
  return `Act as an extremely strict English spell checker specialized in dental and medical content. Carefully analyze the provided text to detect **any spelling mistakes or invalid dental terminology**. Treat each line (separated by \n) as a distinct sentence for analysis.

Your responsibilities:
1. **Only detect spelling errors** — do not flag grammar, capitalization, or formatting issues.
2. Treat the following words as **correct** (do not mark them as mistakes): ${dentalTerms.join(', ')}.
3. **Ignore domain names (e.g., example.com, patienthoney.com)** when checking for spelling errors.
4. Detect **compound or merged words** like "dentalimplant", "zirconiacrown".
5. Flag incorrect or awkward **plurals** like "crownns", "teeths", "implantses".
6. Exclude false positives — if the original and corrected versions are identical, do not include them.
7. Check for **semantic validity** in context (e.g., "implantss" is not a valid dental word).
8. Your response must be **strictly in JSON format**, as an array of error objects.

Each object must contain:
- "errorWord": the incorrect word (English)
- "originalSentence": the full sentence where the error appears
- "correctedSentence": your best spelling fix
- "offset": starting index of the error in the full original input
- "message": **a short description of the spelling issue, written in Vietnamese**

If no errors are found, return an empty array \`[]\`.

Now analyze the following text strictly for spelling mistakes only:

${text}

Example JSON output:
[
  {
    "errorWord": "implantss",
    "originalSentence": "We provide high-quality implantss for patients.",
    "correctedSentence": "We provide high-quality implants for patients.",
    "offset": 28,
    "message": "Từ bị sai chính tả – dạng số nhiều không hợp lệ."
  }
]`;
};
