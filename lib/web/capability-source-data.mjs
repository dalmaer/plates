// Reviewed phase128 parser/source boundary; names stays CLI-only. No runtime dispatch authority.
// 2026-10-26: re-reviewed adoption handoff output on current names-transition source;
// only the adoption source pin changes. CLI forms, treatments and access stay unchanged.
export default {
  "schema": 1,
  "reviewedAt": "2026-10-24",
  "entryKeys": [
    "names",
    "migrate",
    "evidence rederive",
    "status",
    "next",
    "goal list",
    "goal show",
    "goal add",
    "goal retire",
    "phase new",
    "phase claim",
    "ready",
    "integrate",
    "phase list",
    "render",
    "init",
    "adopt",
    "doctor",
    "update",
    "lessons",
    "learn",
    "improve",
    "persona run",
    "time",
    "test",
    "drain",
    "night plan",
    "night tick",
    "morning",
    "goodnight",
    "fleet",
    "fleet update",
    "loose-ends",
    "feedback",
    "issue",
    "review",
    "board",
    "promote",
    "walk",
    "canvas",
    "retro",
    "workspace",
    "shape",
    "decision",
    "production",
    "prove",
    "release",
    "help"
  ],
  "files": [
    {
      "path": "bin/keel.mjs",
      "sha256": "ac96370281c24706065f678515cdfc5bf24927e530dad2aecd1a5938e2351a6e"
    },
    {
      "path": "bin/plates.mjs",
      "sha256": "8daa5ec018ec8aea864a4ae2292287c23c5a06be8f82fd878995d9c8ee84d6f1"
    },
    {
      "path": "lib/adopt.mjs",
      "sha256": "95141640c1a5b5e6fa280bfc88fadd5bc51aa186c74d03db796c296fc4d10ee1"
    },
    {
      "path": "lib/board.mjs",
      "sha256": "6293a897905eb79b86f98f006ac0824ea4699d3aa868b3f5eef9e0bb54232a1a"
    },
    {
      "path": "lib/canvas-controls.mjs",
      "sha256": "9e5c78274d0ce63f8359e5b28ca659974a4fd31486e204be60ed6c5075526d44"
    },
    {
      "path": "lib/canvas-night.mjs",
      "sha256": "20b9c8217deea9ab886b1e9dff8d82bcfcd6ae3ad2de0f2ae9b5803bd3d1d8d8"
    },
    {
      "path": "lib/canvas-render.mjs",
      "sha256": "067cf4545aa53565d3ad7f41513fe282f953bf61eb1aec804f94936409dc3fee"
    },
    {
      "path": "lib/canvas-retro.mjs",
      "sha256": "97159ee596fc1f6505816898e7a3554b8a8d774ce77ce7177b801155c22a049c"
    },
    {
      "path": "lib/canvas-snapshot.mjs",
      "sha256": "6f2f17b59f21b4c8adf7439c423941d48c9272b3bacf62bcfc6c72d3e42ea0d9"
    },
    {
      "path": "lib/canvas-sync.mjs",
      "sha256": "abcab7eb25ff0db265d61131c05ec4e6723dd5c73afd4374aa96ba5f999fb6ec"
    },
    {
      "path": "lib/canvas.mjs",
      "sha256": "e50bdc0b7f8637870e887e8aa6068c84eb58b9069130327a6a143f320cb7e796"
    },
    {
      "path": "lib/ci-adoption.mjs",
      "sha256": "8422899da9d5d0c1168d678a02b0c89c07486475d63538f7181da90869bf9e1a"
    },
    {
      "path": "lib/claim.mjs",
      "sha256": "fca4a58f0d9bce375e49c095278e0bd9bbb3bb43e1a2a80bf241e8532c2fd6ce"
    },
    {
      "path": "lib/cli.mjs",
      "sha256": "a41cfbe06156bc6d96e3d523c2531bad1b17dd1f340881e7119d78deff4eada0"
    },
    {
      "path": "lib/decision.mjs",
      "sha256": "569173678b13a6690f941d5ec27e0c4884b6092223e8807533af6ff2a9407f53"
    },
    {
      "path": "lib/distill.mjs",
      "sha256": "98ca0d39da22f3a218ab8aab8cded1535dfa879e2d777ec6665cabc395ce9662"
    },
    {
      "path": "lib/doctor.mjs",
      "sha256": "61c5c05d57cdbaec32a82aa77b64c16918257764e7d4a4895d05a4b91f6d243a"
    },
    {
      "path": "lib/evaluation-artifacts.mjs",
      "sha256": "3fc915a06ec9668340d5d469e4f8de4dcc7dd10b45810174c68c82b82dc5024d"
    },
    {
      "path": "lib/evaluation-docker.mjs",
      "sha256": "a97f5fe5f5e15f78604bb6c8500b707b7dbc17680ecee803e29f9591dfdf86e6"
    },
    {
      "path": "lib/evaluation-execution-input.mjs",
      "sha256": "20fe11c85f1de1b37230d4f17d07528fb228b15549761cd0b315c9217ee775bd"
    },
    {
      "path": "lib/evaluation-execution.mjs",
      "sha256": "ea0c2eef6268ae0aa1d20dea466c2de6c1d34895ce3af663d42726af7e89af63"
    },
    {
      "path": "lib/evaluation-ledger.mjs",
      "sha256": "501ddfc9cdf7d7a7a0e3a90d20fcc6511dd18bef3e1f2288f14831c6a708b0e0"
    },
    {
      "path": "lib/evaluation-provenance.mjs",
      "sha256": "0265daa86972b8b1d039a99541f01367a691c3d1774045182e68966b948b9c01"
    },
    {
      "path": "lib/evaluation-records.mjs",
      "sha256": "fd120262e67ccef11e3bf9ba31654a0a36c22e2299570380f0d902f727fa1ce5"
    },
    {
      "path": "lib/evidence.mjs",
      "sha256": "1b638bf043995d38515e4376a8df8d1b41f6ad729778e40c29d840e74248c705"
    },
    {
      "path": "lib/feedback-route.mjs",
      "sha256": "0f7b13790cb86d1bdbbf2f1d0ce3df5a0d09ff5a699d8756025e12cf7853ce8a"
    },
    {
      "path": "lib/feedback-service.mjs",
      "sha256": "e70ac587a42c67474cbbb7f1de20125a6ed5c9fe2f62eeb437d38b5f3173b81e"
    },
    {
      "path": "lib/feedback-store.mjs",
      "sha256": "7b4b8f9f1d34c1e21ae6ef855b32a6a009e900dc898ab2d56d0868e43af61c3e"
    },
    {
      "path": "lib/feedback.mjs",
      "sha256": "972a42b12c40474bb31ede8c448e3a6f97991fea4e4152cc614dcca9fe3ba6da"
    },
    {
      "path": "lib/fleet.mjs",
      "sha256": "e2b736102c690e46e39a163945a35e4885e5da1c043613daf82ac029f9fa373b"
    },
    {
      "path": "lib/goals.mjs",
      "sha256": "69a8defbaa2cd70ebfb4b1efd9d3473ce631e9cbb351d853a86937a9072715ef"
    },
    {
      "path": "lib/goodnight.mjs",
      "sha256": "e81edd999a309d131a8ee59e82518ee9af1780c9d8b02b7968dbe7fc77fff833"
    },
    {
      "path": "lib/guide.mjs",
      "sha256": "a18054240073f9753ecfef718b82e3f0aaecbee3767f82065cd5e2b137ad8267"
    },
    {
      "path": "lib/hygiene-proposal-actions.mjs",
      "sha256": "4635dc1a5ca3a4231ca65ee82a37e1a4193f030915b4b81a889693067b58d737"
    },
    {
      "path": "lib/improve.mjs",
      "sha256": "46b2a5d1d46a7b684f3e1155e8c775dd66c145fb506efe3aa46667953b4e3b1d"
    },
    {
      "path": "lib/init.mjs",
      "sha256": "bc3604efb9a09d59e249a451d525b7644b9be3329619df4184b1b81fed071c8d"
    },
    {
      "path": "lib/integrate.mjs",
      "sha256": "549f62635555c2da0a37c6e115dcf038a104ff67301a975e3181300b348aa91c"
    },
    {
      "path": "lib/learn.mjs",
      "sha256": "f90cc26b6d29f451384180d5f27fd93be0064bb72c7209a24cd4102f917184c8"
    },
    {
      "path": "lib/lessons.mjs",
      "sha256": "8e039af0b70ee6f478fd916cfdc8c90359a27955f8e11c0d9981555ca98c2afc"
    },
    {
      "path": "lib/lock.mjs",
      "sha256": "b9a7a3d9b3260f2406feb96a5d30efe8e4c17d77a8182e248258b35970b6fd17"
    },
    {
      "path": "lib/looseends.mjs",
      "sha256": "c80fa35c1a3f122c0b07114bf1da7ccdcded5da265d05152f891fbf2d1498fc1"
    },
    {
      "path": "lib/migrations.mjs",
      "sha256": "a94d9c09b2f6ca340d7d1ffeaf4e2e67db88168646a60914a829692d0c676650"
    },
    {
      "path": "lib/morning.mjs",
      "sha256": "e1659e96f02e1c55827d32319cae3987bf0940de92ad62d2df00bbff16b06326"
    },
    {
      "path": "lib/mutate.mjs",
      "sha256": "3b3d73ea16a1d9657fa1ad3bf8c44ebf90f4abd507d1bba9ea0177ceb67cc3c8"
    },
    {
      "path": "lib/name-concurrency.mjs",
      "sha256": "ac6c6e983418406c11fa18fea0c64d9a9f0ed867231a789fc1e47be4e76742f6"
    },
    {
      "path": "lib/names-actions.mjs",
      "sha256": "ec449c7c4efdfb2c32c148e8ba569089dfa1f8cb8dd78fd0bd80a114890642a9"
    },
    {
      "path": "lib/names-cli.mjs",
      "sha256": "d624c826bdd32ef6251b9c00bc15c8b342ddf523a7279a19a63c1b0ff3766a75"
    },
    {
      "path": "lib/names-machine.mjs",
      "sha256": "f25556cadb5b85a22447b005ffb3fda344589de0a32fdcf916cce996740a7bf2"
    },
    {
      "path": "lib/names-observation.mjs",
      "sha256": "0ccb4a065d7091658501fd431835612fcf81b9546b33fcc52a6731606fafe4da"
    },
    {
      "path": "lib/names-verify.mjs",
      "sha256": "87ea8dcb24b451e78425087b87ca11c6a71fc46542f3ad311e0451e60f631220"
    },
    {
      "path": "lib/names.mjs",
      "sha256": "ebb8f9aacc73ede8ecb7785707e0690b215681003a837649793e4ff711c18c04"
    },
    {
      "path": "lib/night-plan.mjs",
      "sha256": "3ce4d22db0e6e2ea4d9715e8f8f8ad90afa8842b0a9b7289b412b7c35b45bf4c"
    },
    {
      "path": "lib/night.mjs",
      "sha256": "348e504859d6ed89a75526377fba6b90ec1c6a2503e37425769b08be2f78fb67"
    },
    {
      "path": "lib/phases-projects.mjs",
      "sha256": "955e9a564717ec397888510e1f0baee98580bc8c93bdf95e7ea4702122c21d31"
    },
    {
      "path": "lib/practices.mjs",
      "sha256": "7827a6f9734cbdc0a45ba7e16b88a3c84655a8ca2c0a0785f0015c70dfe6d42a"
    },
    {
      "path": "lib/production.mjs",
      "sha256": "6671386e5241d50d78ea2e3e2406db9cd59dc1891d787a642837bb12288ecfc2"
    },
    {
      "path": "lib/project.mjs",
      "sha256": "efd834d2828d97542d778039fcf820c8bf450df8292c62f7dc27499010121f42"
    },
    {
      "path": "lib/prove.mjs",
      "sha256": "2f9370a72b6ebc8f261fc5d3e1c17f9e365f241d02974d6cc15317c985c9782c"
    },
    {
      "path": "lib/quota.mjs",
      "sha256": "dcfecbcdb3bc9129236acf8755bd84337175a2f4689c8fd5990c8f641e08f668"
    },
    {
      "path": "lib/reconcile-workflows.mjs",
      "sha256": "60e7f20e29ee7980a5e80f7775c1167560485e100151fd485e9e9b4928c43d5d"
    },
    {
      "path": "lib/release.mjs",
      "sha256": "dc896e5348a09cfb9a84c7e6f063836b1b9a4d8c6f4030ffa4993fc8bfdc511a"
    },
    {
      "path": "lib/rename.mjs",
      "sha256": "e34831c7d3f7c2b9afd439fb1bec41602d77e8e20366f517af929f3fd92882ff"
    },
    {
      "path": "lib/retro.mjs",
      "sha256": "4adf2951d432852870cf6ebfbbcc518b86fd794bac0f18ce7828cd760b079fb1"
    },
    {
      "path": "lib/review.mjs",
      "sha256": "1bc1d839c144d4bf3d68c3442fea0dd633627f65d5fd332079642cbaeb026cb7"
    },
    {
      "path": "lib/robot-issue.mjs",
      "sha256": "1fbdc890962e392b9f6abbdf74b8163adb8eebf4147c3d0d0de25edf4405ec58"
    },
    {
      "path": "lib/robot-status.mjs",
      "sha256": "ed25cb2b9a8684f7ef73ccf1937081491dec60dce741d16152ffd1adc2c2f8ac"
    },
    {
      "path": "lib/session-ledger-io.mjs",
      "sha256": "d625dfc2340a0580b3838d219a14b0a8055291392c54583808a1ebef0f5bab4a"
    },
    {
      "path": "lib/session-trials.mjs",
      "sha256": "fb886455442b62f4015941357e7da866b6444841c13a89d26bfa4f44df89f10d"
    },
    {
      "path": "lib/shaping-render.mjs",
      "sha256": "b43626c44c35e018b7f497aedecc380a33f79eaacaf171d0bbf8d3a82a5ddbe1"
    },
    {
      "path": "lib/shaping.mjs",
      "sha256": "f4e8602ce24876b96059551c96dbf7e94e1b3c2c7adb963cd3dc02738ecba2b2"
    },
    {
      "path": "lib/stacks.mjs",
      "sha256": "83e4192e5da6f9d6990b1a5d664c5637a3ca80e9e01503c5a3329f1d97091c2a"
    },
    {
      "path": "lib/taken.mjs",
      "sha256": "8b0ecde1537780b2671cc448d6e752a83676c2cf294a9d877d2ffeddb23f2ee0"
    },
    {
      "path": "lib/test.mjs",
      "sha256": "b6d27fb7855ad3cf438ed5fc021858d3fef2a896a9057cf6269037f1dc49f42e"
    },
    {
      "path": "lib/time-proposal-actions.mjs",
      "sha256": "08aa2152c2e2fbf31d3df4c96c9659adfa577aff49aae51843a2b432ad1dbf8f"
    },
    {
      "path": "lib/time.mjs",
      "sha256": "84e8f234bb3b6bc348c6c2e09ec183d0ef45de195b5f64afefddaf6a6adad143"
    },
    {
      "path": "lib/update-prepare.mjs",
      "sha256": "fb40e6bc6782412ed7a36c5de797f6c64b852417651b366d774a3bc4806c1ac7"
    },
    {
      "path": "lib/update.mjs",
      "sha256": "7c2e81b2aec305860b7f8afa2c2fc7f5189986ac43b9b40debe97dafe73b12fc"
    },
    {
      "path": "lib/validation-budget.mjs",
      "sha256": "0c8d01e8d6c309f49bcb74da61ec8e77ecf41f0671de8ffa64e6a4f5d87a5e76"
    },
    {
      "path": "lib/web/update-container.mjs",
      "sha256": "81243ae824cce447b33529ab2a3fa303e4bfad9b8740de36d1716b1c4d94770c"
    },
    {
      "path": "lib/web/workspace.mjs",
      "sha256": "ea2a464401aad8ccd1ac4f39dc8386ffecf6889fafe550547dfd3d482220fcf7"
    },
    {
      "path": "lib/worktree-hygiene.mjs",
      "sha256": "6b10d365b5b2bce207bd1b4e8a227cddb750c3e5b83213a35b7bd3390b3def76"
    },
    {
      "path": "migrations/0004-test-ledger.mjs",
      "sha256": "7b92c2b68160683a07ae95788a51f03522047ae89d0f841be1df5dd43ef64a3d"
    },
    {
      "path": "package.json",
      "sha256": "023d6674d4ea1bd5ebd2867df316f97cea6fc5e06fd5b03d62045e9256338485"
    },
    {
      "path": "practices/agents-md/files/scripts/plates/contract-hook.mjs",
      "sha256": "47ddca508710da288470d5c96a8e14c8a99f77e8c178eb2fb7f401ff481cb70a"
    },
    {
      "path": "practices/agents-md/practice.json",
      "sha256": "8a58c5e73fcf16c4a082266932b8957a2d48dfbc9fac512c0685e53ddb05397e"
    },
    {
      "path": "practices/base/practice.json",
      "sha256": "ee9ad10b17aeb52e5ea520f00d5d451c938366e831891e4c3ad38cd0ba35c215"
    },
    {
      "path": "practices/ci/files/scripts/plates/workflows.mjs",
      "sha256": "32a93025a02d1e5b918c33bd674e30a480cb61af468b30a3516a695325826e92"
    },
    {
      "path": "practices/ci/practice.json",
      "sha256": "351969174d4a5b360d495c4597736e80b944671fe48806d99f7ad3fb1c350dd4"
    },
    {
      "path": "practices/claude/practice.json",
      "sha256": "a515356c66ef695b9134d917d31cd1ff093ed0506154e3cd8193b14c7958f8ce"
    },
    {
      "path": "practices/climb/files/scripts/plates/climb-execution.mjs",
      "sha256": "90e64bc3eaea5a081df63fa0e0c597fcbfd0c710bf227f7dc7ba1eb59da64eb6"
    },
    {
      "path": "practices/climb/files/scripts/plates/climb.mjs",
      "sha256": "8518e0c5db11c2e195eaf32df0e7510796572f589bba3ff336589bc7afef582a"
    },
    {
      "path": "practices/climb/files/scripts/plates/distill.mjs",
      "sha256": "09d39157b3d7f17fd2110ed9ca99cdee8c7b66d363eb8b14f4936a603ba852fe"
    },
    {
      "path": "practices/climb/files/scripts/plates/names.mjs",
      "sha256": "22a446c61b7b864cee79c4f5dc8f7f238971a7c0f1c3c9b8b1a9e13fd7962ad7"
    },
    {
      "path": "practices/climb/files/scripts/plates/robot-policy.mjs",
      "sha256": "f1a485a5cc99e6cb6e549ff5e9cac253c2b78a6996feed9791d5a494bf8ba4be"
    },
    {
      "path": "practices/climb/files/scripts/plates/robot-rubric.mjs",
      "sha256": "3e14fc202531a46f0ff407f82b77f73690e075e95d9d1af92851bb4f8f3a8449"
    },
    {
      "path": "practices/climb/files/scripts/plates/robot.mjs",
      "sha256": "980d2937494a2a1bad253c232a6f4bedb7d2aab8bd947f7cfbf263ae084db1f0"
    },
    {
      "path": "practices/climb/files/scripts/plates/tend.mjs",
      "sha256": "600866fd5a0c3bb3a9805c775e467939ef80d30aab7fb9ff1c8cdbd536e59452"
    },
    {
      "path": "practices/climb/practice.json",
      "sha256": "cc78bcd1c1ef63c24f20a89b23a4b044ade06d7383339bf5ce68ff1624698492"
    },
    {
      "path": "practices/conduct/practice.json",
      "sha256": "f55f1c7867b7bfa6c8e0ce26c2d402e51be6790315bfc763dafadd3755b6372f"
    },
    {
      "path": "practices/cross-review/files/scripts/plates/cross-review.mjs",
      "sha256": "4946610045da05b1ca324158298d536a9648919e49bd0c708f349e8a7d6ed40f"
    },
    {
      "path": "practices/cross-review/practice.json",
      "sha256": "befa9239f8a8bde76baf65d6721da5016c1313fbbeb2fe96a0f9b37f6a4d41d6"
    },
    {
      "path": "practices/delivery/files/scripts/plates/delivery.mjs",
      "sha256": "e270954b1d8723cae627410d333530fe323f8cc4edf18cffaaa827bcfc784c9b"
    },
    {
      "path": "practices/delivery/files/scripts/plates/promote.mjs",
      "sha256": "41c31ba4af9049ab56c34475276385ca668b5db2afa8e2134e3c1a2199f5e75a"
    },
    {
      "path": "practices/delivery/files/scripts/plates/publish.mjs",
      "sha256": "b343acb69dfdb15cc761da82e9e001e3acc61a6b81869064e4949eae33fe3258"
    },
    {
      "path": "practices/delivery/files/scripts/plates/verify.mjs",
      "sha256": "987680909566adbc9b766b926b9574c7ab990d4961f7c63dbc83bdf39d4ced19"
    },
    {
      "path": "practices/delivery/practice.json",
      "sha256": "afe346de844b74c7e46c10d54f52df699324dbf8ec0cba8c066c0ea6fedc7387"
    },
    {
      "path": "practices/evidence/practice.json",
      "sha256": "8dfc3a8a4dab2354b268498022e20e7e05e234706db90c313317a987ff6defd1"
    },
    {
      "path": "practices/lessons/practice.json",
      "sha256": "174e64b5fe5d969a2bc374b5c1beb223c64554e830be7d117cf1c66ff1335ba2"
    },
    {
      "path": "practices/loop/files/scripts/loop.mjs",
      "sha256": "dcf8dfa6276430d184218cb312f1d2e994854429e891af964ba2b9c207c060fd"
    },
    {
      "path": "practices/loop/files/scripts/plates/names.mjs",
      "sha256": "587c4cf39e9ea8e49206d5e59894681b2939cf138b61fdd56ffc9e7945c7d93a"
    },
    {
      "path": "practices/loop/practice.json",
      "sha256": "3a5ffb7ff711e8813dff659a264d99b6410133c12331534ca73d12b021d92e27"
    },
    {
      "path": "practices/night/files/scripts/plates/canvas-recovery.mjs",
      "sha256": "f210f789c7fb79659eda6dabad9ab8f840a6fd83a4a28b468ecfc989fe11df58"
    },
    {
      "path": "practices/night/files/scripts/plates/ci.mjs",
      "sha256": "f971394c913bc36cee493a02521d5d7e6f4727d6b85f00a62eb39f6a73c6c1ba"
    },
    {
      "path": "practices/night/files/scripts/plates/drain.mjs",
      "sha256": "abb282e172c8e45abbce3f87e37d40a62f8a384b0782d5f379cea8c37029a0e2"
    },
    {
      "path": "practices/night/files/scripts/plates/gate.mjs",
      "sha256": "0ccdfbfcfd985ca3dfd83ae4cd785c2c79cbe284735860818eb7f31d2c9e8179"
    },
    {
      "path": "practices/night/files/scripts/plates/hygiene-measures.mjs",
      "sha256": "5911b8c23e2661156c1b4f71c17bf3b773969682046bc2bcd5db6822ca045796"
    },
    {
      "path": "practices/night/files/scripts/plates/hygiene-proposals.mjs",
      "sha256": "05863d3e102e80009749b6b56a71ad58ffc526a70c27feb14c9456f2db5493ea"
    },
    {
      "path": "practices/night/files/scripts/plates/improve.mjs",
      "sha256": "240bb10e43edd4cbdd1c8ed626340dd8b7e1b6c6227d1fd9002a649e210a96dc"
    },
    {
      "path": "practices/night/files/scripts/plates/lib.mjs",
      "sha256": "0a224f841d6ccd23c2710c1e336af7c5b4943fce61648e4a708118c85bbdcc44"
    },
    {
      "path": "practices/night/files/scripts/plates/milestones.mjs",
      "sha256": "5f6d9ecafd2432bdb3a9bf4ddf90578dbd8bafa58a6dcae1e0f47627f8429853"
    },
    {
      "path": "practices/night/files/scripts/plates/morning.mjs",
      "sha256": "6a49e061350f78c9a28c090ca1d58eefed109ceae9617974a80b98cd570048f0"
    },
    {
      "path": "practices/night/files/scripts/plates/names-environment.d.mts",
      "sha256": "0a7d19788c21f1468f9af4ed9fe079ee7d29769ffc89320ef56276567eca283a"
    },
    {
      "path": "practices/night/files/scripts/plates/names-environment.mjs",
      "sha256": "edbbf5138d1128c2b3f852e1786808f42e5cdc833d6c36e9083c3d7738f1dee2"
    },
    {
      "path": "practices/night/files/scripts/plates/names-observation.mjs",
      "sha256": "7929a346b7adc189190ae6025f11e0674ee00f9a814d0ac0c136648cb5dcfd48"
    },
    {
      "path": "practices/night/files/scripts/plates/names.mjs",
      "sha256": "7e6e72a1dc405a9166d19a739345a4a39f24f6a1ed0a616ab2e86f42b26abb73"
    },
    {
      "path": "practices/night/files/scripts/plates/night-plan.mjs",
      "sha256": "6e2ebcab928ee9fea363a729473816442d9a1efdaf6cdefc5d1291a5c0d91f07"
    },
    {
      "path": "practices/night/files/scripts/plates/planning-config.mjs",
      "sha256": "f47844a4e5e1f2259d67c4e3d8e4a6e43a4cb036ed1f6357438fee801f03ef3e"
    },
    {
      "path": "practices/night/files/scripts/plates/pr-body.mjs",
      "sha256": "f4ba82489b7c3cde03c75c0ba18a4ee14b93fec8e2a46a8b5900662b4accf36f"
    },
    {
      "path": "practices/night/files/scripts/plates/production-collectors.mjs",
      "sha256": "5da0812a17367dad05e9c19bc3dce19cfae23f6863983110cda18baf12d3a980"
    },
    {
      "path": "practices/night/files/scripts/plates/production-night.mjs",
      "sha256": "e496379d8d048355c0ffbd63224c0947ebc3fa25d8a84dc83b7348d4515b7b11"
    },
    {
      "path": "practices/night/files/scripts/plates/production-store.mjs",
      "sha256": "fe0d3ad8d833a31b8f36dfdc38d2065607775371e98d85a1830ebf8b280705d6"
    },
    {
      "path": "practices/night/files/scripts/plates/production.mjs",
      "sha256": "d903d9555c040775bf0c270c6e47f604f8757a2c1a0afa7add9556c7f22488d1"
    },
    {
      "path": "practices/night/files/scripts/plates/quota.mjs",
      "sha256": "a498d93b39fbb85039dbbcf002ab474dc27e12a12e466391976e1b6715f1108d"
    },
    {
      "path": "practices/night/files/scripts/plates/robot-budget.mjs",
      "sha256": "7680bb21b62cb52266cc59f644ce7a97ce8a135baab0221d0f7f5d4ee800ee45"
    },
    {
      "path": "practices/night/files/scripts/plates/robot-delivery.mjs",
      "sha256": "df4f7334e81ffd983cb5e8720b05d7081ff9acbd941350feb4065450a49973ee"
    },
    {
      "path": "practices/night/files/scripts/plates/stalls.mjs",
      "sha256": "c904dba5ba3ff5b19518353edc2dbeaee5a29ebcf6aceb958b20c5daeb1d15d0"
    },
    {
      "path": "practices/night/files/scripts/plates/test-history.mjs",
      "sha256": "2cf60a228b3534b4ca1b9e194ef493eeb054b2e076449bae2391ab6de8672d25"
    },
    {
      "path": "practices/night/files/scripts/plates/test-ledger.mjs",
      "sha256": "14f971d82a51979c41fe4aed6625c959b63b11b2b87632e61654ec5e98de3f59"
    },
    {
      "path": "practices/night/files/scripts/plates/time-measures.mjs",
      "sha256": "912c3deac5440efcd3de459fb51e02346d6bbdb7e1ba6e62e340a416ebcc1aac"
    },
    {
      "path": "practices/night/files/scripts/plates/time-proposal-remeasurement.mjs",
      "sha256": "cc2e40051406bbe8bd90dc4d233bdf8b5fd3dee76e5646443ec7988c9448461b"
    },
    {
      "path": "practices/night/files/scripts/plates/time-proposals.mjs",
      "sha256": "cc4b35b4f0595a51dfcc710a1f49e46e2f40f9a2290affa0152182da7389dede"
    },
    {
      "path": "practices/night/files/scripts/plates/time-receipts.mjs",
      "sha256": "a490eaef57bf84cd6331fd4fa8a96f85dcbae5e5b8b5a1e32364d17213b6b21d"
    },
    {
      "path": "practices/night/files/scripts/plates/verification.mjs",
      "sha256": "6428b9bb959e198f05e89bf2d4c284efa7196b9785e977cdc8ce991e7277f4f7"
    },
    {
      "path": "practices/night/practice.json",
      "sha256": "6799ba7e65c52d90134ea290c4207c4d1bd70201749bcd2af5b7587d6e830c41"
    },
    {
      "path": "practices/personas/files/scripts/plates/persona.mjs",
      "sha256": "06f14e12d7a42989103009424cc4a5a92d63a2f115f9d8ee059ca6b3358afb50"
    },
    {
      "path": "practices/personas/practice.json",
      "sha256": "7a056505bf6f0c8f344aa68a16c6fad4b2f51fb3aa0147c80f1db85dbdeae0c4"
    },
    {
      "path": "practices/phases/files/scripts/plates/generated.mjs",
      "sha256": "576d85d128821eb2905df1b2d2e56ea2ef898b832e3ed31d8eec419d9f68ee43"
    },
    {
      "path": "practices/phases/files/scripts/roadmap.mjs",
      "sha256": "42aa630f51a884f4d1066cd19972c41d3a7365741cfcd84d78b5e7a6706ccf42"
    },
    {
      "path": "practices/phases/practice.json",
      "sha256": "883368dbf8f70ed6c70d23c80591325c10716a95a00f8c8cd3fd72c11a2c57ab"
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/decision-context.mjs",
      "sha256": "16d09fee3ff52e64665d57582cf3fa90a932a2b2212620ad99c27e203804c206"
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/names.mjs",
      "sha256": "587c4cf39e9ea8e49206d5e59894681b2939cf138b61fdd56ffc9e7945c7d93a"
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/reconcile-actions.mjs",
      "sha256": "dbaf31f84c3a268f5fd5a602cd44bc4419ee725ef4f02b88915099727b75df95"
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/reconcile.mjs",
      "sha256": "95aedc3ec7f85b82a655f0ff00b2d4044ac89032a7c8c646fd4a63785052a7bf"
    },
    {
      "path": "practices/reconciliation/practice.json",
      "sha256": "beb5a2fe6977ff6fe3743235d6d82332fe950161ff23c76762fcf1682774dde2"
    },
    {
      "path": "practices/renovate/practice.json",
      "sha256": "7ce406af2d86696d57bf58696c6db0871f59b927391dce97b41b607ab6dd73f3"
    },
    {
      "path": "practices/shaping/practice.json",
      "sha256": "1eb22690fecf61a595caf61742986ddbb34b2c75c5f3e65b7e127a07d6f48e10"
    },
    {
      "path": "scripts/migrate-plates.mjs",
      "sha256": "2222170295991ecb306540a03374829cdb7b6c72b2a67666b3b42f9440ba2116"
    },
    {
      "path": "tests/fixtures/improve/hygiene-evidence.mjs",
      "sha256": "ec137d5f1c2918533516d0b6aba3cb99cced2ef8b57179a25e183f91d27922d8"
    },
    {
      "path": "tests/fixtures/improve/time-evidence.mjs",
      "sha256": "fbcecb045ee94c00adb7539669250fa090fe4c9a0c668fd29a82ecabb0c384bb"
    }
  ],
  "practiceScripts": [
    {
      "path": "practices/agents-md/files/scripts/plates/contract-hook.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/ci/files/scripts/plates/workflows.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/climb-execution.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/climb.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/climb/files/scripts/plates/distill.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/names.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/robot-policy.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/robot-rubric.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/climb/files/scripts/plates/robot.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/climb/files/scripts/plates/tend.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/cross-review/files/scripts/plates/cross-review.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/delivery/files/scripts/plates/delivery.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/delivery/files/scripts/plates/promote.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/delivery/files/scripts/plates/publish.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/delivery/files/scripts/plates/verify.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/loop/files/scripts/loop.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/loop/files/scripts/plates/names.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/canvas-recovery.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/ci.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/drain.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/gate.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/hygiene-measures.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/hygiene-proposals.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/improve.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/lib.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/milestones.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/morning.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/names-environment.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/names-observation.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/names.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/night-plan.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/planning-config.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/pr-body.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/production-collectors.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/production-night.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/production-store.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/production.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/quota.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/robot-budget.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/robot-delivery.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/stalls.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/test-history.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/test-ledger.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/night/files/scripts/plates/time-measures.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/time-proposal-remeasurement.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/time-proposals.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/time-receipts.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/night/files/scripts/plates/verification.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/personas/files/scripts/plates/persona.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/phases/files/scripts/plates/generated.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/phases/files/scripts/roadmap.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/decision-context.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/names.mjs",
      "entrypoint": false
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/reconcile-actions.mjs",
      "entrypoint": true
    },
    {
      "path": "practices/reconciliation/files/scripts/plates/reconcile.mjs",
      "entrypoint": true
    }
  ],
  "practiceManifests": [
    "practices/agents-md/practice.json",
    "practices/base/practice.json",
    "practices/ci/practice.json",
    "practices/claude/practice.json",
    "practices/climb/practice.json",
    "practices/conduct/practice.json",
    "practices/cross-review/practice.json",
    "practices/delivery/practice.json",
    "practices/evidence/practice.json",
    "practices/lessons/practice.json",
    "practices/loop/practice.json",
    "practices/night/practice.json",
    "practices/personas/practice.json",
    "practices/phases/practice.json",
    "practices/reconciliation/practice.json",
    "practices/renovate/practice.json",
    "practices/shaping/practice.json"
  ],
  "dynamicBoundaries": [
    {
      "source": "practices/personas/files/scripts/plates/persona.mjs",
      "line": 65,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/night/files/scripts/plates/production.mjs",
      "line": 117,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/night/files/scripts/plates/night-plan.mjs",
      "line": 358,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/night/files/scripts/plates/improve.mjs",
      "line": 191,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/night/files/scripts/plates/improve.mjs",
      "line": 809,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/night/files/scripts/plates/improve.mjs",
      "line": 1772,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/loop/files/scripts/loop.mjs",
      "line": 74,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/climb/files/scripts/plates/tend.mjs",
      "line": 371,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/climb/files/scripts/plates/climb.mjs",
      "line": 416,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "practices/climb/files/scripts/plates/climb.mjs",
      "line": 1240,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "lib/cli.mjs",
      "line": 42,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "lib/goodnight.mjs",
      "line": 166,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "lib/goodnight.mjs",
      "line": 304,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "lib/migrations.mjs",
      "line": 55,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    },
    {
      "source": "lib/mutate.mjs",
      "line": 19,
      "boundary": "Computed local import; current installed/project implementation and configuration are outside canonical grammar proof."
    }
  ],
  "globals": {
    "source": "lib/cli.mjs:979",
    "precedence": [
      "--agent-help anywhere before normal dispatch",
      "--version anywhere next",
      "first token absent|--json|--help|-h => help",
      "longest registered two-word prefix then one-word prefix"
    ],
    "forms": [
      {
        "tokens": [
          "--agent-help"
        ],
        "positionals": "topic|all:0..1",
        "flags": [
          "--json"
        ],
        "treatment": "presentation-only"
      },
      {
        "tokens": [
          "--version"
        ],
        "flags": [
          "--json"
        ],
        "treatment": "presentation-only"
      },
      {
        "tokens": [
          "--help",
          "-h"
        ],
        "position": "first only",
        "flags": [
          "--json"
        ],
        "treatment": "presentation-only"
      },
      {
        "tokens": [
          "--json"
        ],
        "position": "first alone invokes help; otherwise representation flag",
        "treatment": "presentation-only"
      }
    ],
    "warning": "No universal post-verb --help or generic --yes; normal inline options often first-wins, forwarded goodnight last-wins, strict parsers reject duplicates."
  },
  "rejectedSyntax": [
    {
      "syntax": "plates release --yes",
      "reason": "Release has no --yes authorization flag; explicitly rejected."
    },
    {
      "syntax": "plates canvas capture",
      "reason": "Capture is exposed only through plates retro capture."
    },
    {
      "syntax": "plates <verb> --help",
      "reason": "No universal post-verb help; first-token help aliases are dispatcher-only."
    }
  ]
};
