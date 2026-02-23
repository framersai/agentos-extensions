export type TriviaQuestion = {
  id: string;
  question: string;
  choices: [string, string, string, string];
  answerIndex: 0 | 1 | 2 | 3;
  explanation: string;
};

const BANK: TriviaQuestion[] = [
  {
    id: 'ai-embeddings-1',
    question: 'In modern RAG systems, what are “embeddings” primarily used for?',
    choices: [
      'Compressing images for faster upload',
      'Mapping text to vectors for similarity search',
      'Encrypting prompts before sending to the model',
      'Generating random tokens for creativity',
    ],
    answerIndex: 1,
    explanation: 'Embeddings map content into vector space so semantically similar items are close for retrieval.',
  },
  {
    id: 'sec-cve-1',
    question: 'What does “CVE” stand for?',
    choices: ['Common Vulnerability Enumeration', 'Cyber Verification Engine', 'Critical Vector Exploit', 'Common Version Error'],
    answerIndex: 0,
    explanation: 'CVE = Common Vulnerabilities and Exposures, a catalog identifier for security issues.',
  },
  {
    id: 'web-http-1',
    question: 'Which HTTP status code means “Too Many Requests”?',
    choices: ['401', '403', '404', '429'],
    answerIndex: 3,
    explanation: '429 is returned when you hit a rate limit.',
  },
  {
    id: 'ml-overfit-1',
    question: 'Overfitting most directly means a model is…',
    choices: [
      'Too small to learn anything useful',
      'Performing well on training data but poorly on new data',
      'Unable to handle missing values',
      'Only trained on images',
    ],
    answerIndex: 1,
    explanation: 'Overfitting is poor generalization despite strong training performance.',
  },
  {
    id: 'crypto-uniswap-1',
    question: 'On Uniswap V2, what is a “pair” contract?',
    choices: [
      'A wallet that holds two tokens',
      'A contract that manages swaps + liquidity for two tokens',
      'A contract that mints NFTs for trades',
      'A contract that sets gas prices',
    ],
    answerIndex: 1,
    explanation: 'Each token pair has a dedicated pair contract that holds reserves and executes swaps.',
  },
  {
    id: 'discord-embed-1',
    question: 'Discord embed descriptions have a max length of…',
    choices: ['1,024 chars', '2,000 chars', '4,096 chars', '10,000 chars'],
    answerIndex: 2,
    explanation: 'Embed description limit is 4,096 characters.',
  },
  {
    id: 'ai-transformer-1',
    question: 'In a Transformer, “attention” is best described as…',
    choices: [
      'A way to focus computation on relevant tokens',
      'A loss function used for classification',
      'A method to compress weights to 4-bit',
      'A data augmentation technique',
    ],
    answerIndex: 0,
    explanation: 'Attention weights let the model mix information from different tokens based on relevance.',
  },
  {
    id: 'sec-phishing-1',
    question: 'Phishing is primarily an example of…',
    choices: ['A hardware failure', 'A social engineering attack', 'A compiler optimization', 'A DDoS mitigation'],
    answerIndex: 1,
    explanation: 'Phishing targets humans via deception to obtain credentials or sensitive info.',
  },
  {
    id: 'oss-license-1',
    question: 'Which license is a strong “copyleft” license?',
    choices: ['MIT', 'Apache-2.0', 'GPLv3', 'BSD-2-Clause'],
    answerIndex: 2,
    explanation: 'GPLv3 requires derivative works to be distributed under the same license terms.',
  },
  {
    id: 'db-acid-1',
    question: 'In databases, ACID properties include…',
    choices: [
      'Authentication, Caching, Indexing, Durability',
      'Atomicity, Consistency, Isolation, Durability',
      'Availability, Consistency, Integrity, Distribution',
      'Aggregation, Clustering, Inference, Denoising',
    ],
    answerIndex: 1,
    explanation: 'ACID = Atomicity, Consistency, Isolation, Durability.',
  },
];

export function randomTriviaQuestion(): TriviaQuestion {
  if (BANK.length === 0) throw new Error('Trivia bank is empty');
  return BANK[Math.floor(Math.random() * BANK.length)]!;
}

