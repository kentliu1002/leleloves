# AI homework review repair

Approved scope: image orientation, conservative question review, concise validated output; repair the September 8 math feedback only after visual verification.

1. Add regression tests for truncated replies, invalid JSON, rambling, identical wrong/correct answers and uncertain handwriting. Reject such results before persistence.
2. Normalize EXIF, detect page rotation, preserve readable resolution, temporarily upload normalized photos and submit URLs to avoid large cross-border request bodies. Clean up only files created by the request.
3. Request structured concise findings, independently review candidate mistakes against the photos, and format validated findings for existing clients. Never accept partial image sets or model output cut off by token limits.
4. Verify regression tests/build, run the actual math image, visually compare findings, deploy and verify production. Replace the known bad feedback only with a reviewed replacement. Apply output validation to the standalone local worker as well.

Limits: schema checks cannot guarantee mathematical correctness; uncertain recognition must remain a request for human review. No changes to unrelated homework, navigation, or scheduled-task installation.
