# Public source boundary

Only the versioned bridge interface, client, synthetic examples/tests and public
build checks belong here. Do not import product internals or copy runtime data,
credentials, provisioning, signing, factory, deployment or hardware design files.

Run npm run check after changes. Maintain scripts/boundary.mjs deliberately when
adding files; passing the scanner is not a substitute for content review. Never
claim hardware verification based on client tests. Do not publish npm packages or
change license terms without explicit owner approval. No private CI credentials.
