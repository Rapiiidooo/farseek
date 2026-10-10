# Developer review hosting

```bash
node scripts/build-developer.mjs outputs/developer-review
```

The isolated artifact serves the current working checkout at `/`, the asset lab at `/labs/<asset-id>` and the self-contained gallery at `/gallery/`. A dedicated `dev.farseek.rapidoai.dev` host on the existing infrastructure avoids changing the public campaign. The archive includes only static runtime and gallery extensions. Its manifest records source and delivered hashes. `LOCAL_PREVIEW` is enabled only in the artifact, so chapter testing keeps campaign progress isolated on the developer host. The host's `current` link targets the artifact's `public/` tree; the manifest stays outside that static root.

The gallery compares sixteen preserved Nyra milestones under Before, After, After 2 and subsequent labels. It identifies the current revision, superseded work and the rejected smile. Original capture framing is retained. The current Wildwood clips replace the chapter previews; the combined tours and older chapter and character films remain historical. `capture-details.html` and the iteration provenance accompany the gallery.

Include [the Nginx fragment](developer-hosting.nginx) inside the developer host's existing TLS server block. Configure that host's DNS, certificate, password file and `/srv/farseek-dev/current` through the private infrastructure procedure before activation. Nginx [HTTP basic authentication](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html) protects every route, including assets and MP4 files. Do not put the password file inside the static root. The developer host should keep its own release directories and atomic `current` switch.

The lab can inspect assets, preview animations and start isolated chapters. Asset creation, saving changes online and shared editing require a separate editor backend.

Building this artifact grants no permission to upload it, configure infrastructure, push or replace production. The normal release builder still packages only a committed `game/` tree. An authorized developer publication must verify unauthenticated rejection, authenticated gallery playback, direct lab URLs, chapter isolation, source hashes and rollback through the private deployment procedure.
