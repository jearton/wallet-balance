// Intentionally published teaching/development samples, not collected user secrets.
export const PUBLIC_COMMUNITY_WALLETS = [
  {
    name: "University Truffle mnemonic",
    source:
      "https://libaoj.in/courses/2018f/COSC5010/Lecture.Note/2/COSC.5010.Lecture.Note.2_Libao.Jin.pdf",
    input: {
      mode: "mnemonic",
      phrase: "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
    },
    ethereumAddress: "0x627306090abaB3A6e1400e9345bC60c78a8BEf57",
  },
  {
    name: "DEV Community Ganache mnemonic",
    source: "https://dev.to/yakult/02-understanding-blockchain-with-ethersjs-4-tasks-of-wallet-nn5",
    input: {
      mode: "mnemonic",
      phrase: "myth like bonus scare over problem client lizard pioneer submit female collect",
    },
    ethereumAddress: "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
  },
  {
    name: "DEV Community Ganache private key",
    source: "https://dev.to/yakult/02-understanding-blockchain-with-ethersjs-4-tasks-of-wallet-nn5",
    input: {
      mode: "private",
      privateKey: "0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d",
    },
    ethereumAddress: "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1",
  },
  {
    name: "Community multichain library WIF example",
    source: "https://github.com/khayamkarim/main-wallet#get-address-from-private-key",
    input: { mode: "private", privateKey: "KxqTGtCMnX6oL9rxynDKCRJXt64Gm5ame4AEQcYncFhSSUxFBkeJ" },
  },
];
