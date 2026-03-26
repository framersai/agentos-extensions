---
name: vision-ocr
description: Extract text from images using OCR and vision AI
version: 1.0.0
tags: [vision, ocr, text-extraction, document, handwriting]
tools_required: [vision-pipeline]
---

# Vision & OCR

Extract text from images, documents, and handwritten notes using a progressive 3-tier pipeline: local OCR (PaddleOCR) -> local vision models (TrOCR, Florence-2) -> cloud vision (GPT-4o, Claude).

## Capabilities
- **Printed text OCR**: Extract text from documents, receipts, screenshots
- **Handwriting recognition**: Read handwritten notes and forms via TrOCR
- **Document layout**: Understand tables, figures, headings via Florence-2
- **Image embeddings**: Generate CLIP vectors for semantic image search

## Example
"Read the text from this receipt"
"What does this handwritten note say?"
"Extract the table data from this PDF page"
