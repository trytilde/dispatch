# BNA UI provenance

The components in this directory, along with `../../hooks/useColor.ts`,
`../../hooks/useColorScheme.ts`, `../../hooks/useColorScheme.web.ts`,
`../../hooks/useHaptics.ts`, `../../hooks/useKeyboardHeight.ts`,
`../../hooks/useModeToggle.tsx`, `../../providers/mode-provider.tsx`,
`../../theme/colors.ts`, and `../../theme/globals.ts`, were retrieved on
2026-08-17 with `bna-ui` CLI version `3.0.0` from the BNA UI registry at
<https://ui.ahmedbna.com/r>.

BNA UI distributes source rather than a package: the CLI copies these files into
the app, so they are OpenBot source from here on. The upstream project is MIT
licensed, copyright (c) 2025 Ahmed BNA.

The files are otherwise unedited, but the repository formatter has run over
them, so the hashes below are of the in-repo versions and will not match a raw
registry download byte for byte. Three upstream lint warnings about unused
locals in `button.tsx` and `input.tsx` are left in place deliberately, so a
later `bna-ui add --overwrite` produces a readable diff.

Re-add or update a component from `apps/mobile`:

```bash
pnpm dlx bna-ui add <name>
pnpm dlx bna-ui add <name> --overwrite
```

Keep OpenBot composition and state wiring in `src/App.tsx` and the runtime
modules rather than inside these files, so local changes to vendored source stay
obvious.

| File | SHA-256 in repo |
| --- | --- |
| `components/ui/avatar.tsx` | `08eb06e7f714d896330e26ea238b3735eae0324cb08066f0722b39c9c7a8ee0e` |
| `components/ui/avoid-keyboard.tsx` | `b8b2267bed3b430bb0e58c397925e393ada585a6c490e53cd91bffcbb16c91dd` |
| `components/ui/button.tsx` | `5f765993c0c4668087491f76810085a843ba8f8aacc3b10497e9b0c340ce1f16` |
| `components/ui/card.tsx` | `99cde6c7adef1508aac7d0dc0c7521fa6bf580b4d7a7652a8c8792b801d9c14d` |
| `components/ui/icon.tsx` | `384d581d8a19907946d95dac11ada02f513c05d0edc747ef103bec6a5d0d97e3` |
| `components/ui/image.tsx` | `82231c2565812cdf9c0ef2488d765ba525319ff595c24dafa38bd5f14a2e4d8d` |
| `components/ui/input.tsx` | `e0ed51817574fcef8d7d3585e2c09335c6a4360a8ab585bfb6cfadb68a051a88` |
| `components/ui/mode-toggle.tsx` | `a0a65cf5ea6ec5220415be7c9a24dec147af2aea601d7fffd8212170ca549ee2` |
| `components/ui/scroll-view.tsx` | `20c58918113f353f428f29afa93195ea8b06e2b15bcc55eaa127202bf9eda846` |
| `components/ui/separator.tsx` | `75f045382160d8cc195bebf45a3b97ce17759dda44ce451c179e26cf4cb0cd24` |
| `components/ui/spinner.tsx` | `3bd9f1fde10bb6127a15183eb8d16711a782c27d42180a1c2d7a24bb83f56483` |
| `components/ui/text.tsx` | `cfc7ea5b60d6537332106608b154f99e2bc910658774de13a24804f910d6110d` |
| `components/ui/view.tsx` | `35d5d52ecf40b64cfb4bc420436bbb66ec1a0dad2988d464d642c28a845cfe8a` |
| `hooks/useColor.ts` | `e25d61843c350e22f21d09d9699a8d8fed9677de4e0fef398f8f83d20dcddba5` |
| `hooks/useColorScheme.ts` | `66dac18232fe439f554730c34a3c73470cc53c44f9bcb9cecb598092b22e0c11` |
| `hooks/useColorScheme.web.ts` | `c75195da163b2893a8fdde25c2f4c6e68dae67a41e3524da3b2b81638ee4d12a` |
| `hooks/useHaptics.ts` | `57e81ed7a092f85f6ffb27ce56c7e60202af7f9bc3713a8e2df4d78e790855b9` |
| `hooks/useKeyboardHeight.ts` | `17d4e24f48b41c5a9db958392917aabbb9c332ffa6b37d3ffeb6e4eb34ffbd1c` |
| `hooks/useModeToggle.tsx` | `459988461c01701ae367d17da99c3f33c16c178d9b32701dc1db34c0c8047901` |
| `providers/mode-provider.tsx` | `2a7d9e9ba6037bb5fd3e84fe8f5963719695636cb60d7ce857dc18244aa32a18` |
| `theme/colors.ts` | `fb224ab0051e4317ffc4aa3a16b1a045c4d936fa06df58608f416e30d2cbd626` |
| `theme/globals.ts` | `cdd89065affb98cc57472ff02fa4aafa41bc2f73e69aa7aee6e30d574dcedd23` |
