/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    user: {
      id: number;
      email: string;
      name: string;
      sessionId: string;
    } | null;
  }
}
