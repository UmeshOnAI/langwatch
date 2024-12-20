import { Anthropic } from "../../components/icons/Anthropic";
import { Azure } from "../../components/icons/Azure";
import { Cloudflare } from "../../components/icons/Cloudflare";
import { Google } from "../../components/icons/Google";
import { Groq } from "../../components/icons/Groq";
import { Meta } from "../../components/icons/Meta";
import { Mistral } from "../../components/icons/Mistral";
import { OpenAI } from "../../components/icons/OpenAI";
import { Custom } from "../../components/icons/Custom";
import { type modelProviders } from "./registry";
import { Gemini } from "../../components/icons/Gemini";
import { GoogleCloud } from "../../components/icons/GoogleCloud";

export const modelProviderIcons: Record<
  keyof typeof modelProviders,
  React.ReactNode
> = {
  openai: <OpenAI />,
  azure: <Azure />,
  anthropic: <Anthropic />,
  groq: <Groq />,
  vertex_ai: <GoogleCloud />,
  gemini: <Gemini />,
  cloudflare: <Cloudflare />,
  custom: <Custom />,
};

export const vendorIcons: Record<string, React.ReactNode> = {
  azure: <Azure />,
  openai: <OpenAI />,
  meta: <Meta />,
  mistral: <Mistral />,
  anthropic: <Anthropic />,
  google: <Google />,
  cloudflare: <Cloudflare />,
};
