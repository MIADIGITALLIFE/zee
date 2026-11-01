# Mia automatic English translation

This pipeline reads the three public Chinese feeds from ZEEFSEE/ZEE, uses the existing Agnes-compatible AI model through a Supabase Edge Function, validates translation structure, and publishes independent English JSON feeds in this repository.

Outputs:
- mia/en/daily.json
- mia/en/todays-philosophy.json
- mia/en/sections.json

Chinese source feeds are read-only. Stable dates and section IDs are preserved. The machine marks output published only after structural and basic untranslated-Chinese checks pass. A committed `mia/en/translation-state.json` stores source hashes so repeated scheduled runs avoid duplicate translation API calls. This is fully automated machine publication, not human editorial certification; machine translation can still make nuanced or factual mistakes.

## One-time setup

1. Deploy supabase/functions/mia-auto-translate to Supabase project xeykndpirxfuozeunkku.
2. In Supabase Edge Function secrets, add MIA_TRANSLATION_WORKFLOW_TOKEN (a newly generated high-entropy secret). Keep the existing AGNES_API_KEY; optionally configure AGNES_MODEL and AGNES_BASE_URL.
3. Add the same token as this repository's GitHub Actions secret MIA_TRANSLATION_WORKFLOW_TOKEN.
4. Add Actions variable SUPABASE_TRANSLATION_URL with value https://xeykndpirxfuozeunkku.supabase.co/functions/v1/mia-auto-translate.
5. Run the workflow manually once. It then runs daily at 00:25 UTC (08:25 Singapore time).

Never put the token or provider API key in browser code, logs, or committed files. On any source, AI, or validation failure, the workflow stops without publishing partial outputs.
