# 10x-cards

<p align="center">
  <strong>An AI-powered application to automatically generate flashcards from text.</strong>
</p>

---

## Table of Contents

- [Project Description](#project-description)
- [Tech Stack](#tech-stack)
- [Getting Started Locally](#getting-started-locally)
- [Available Scripts](#available-scripts)
- [Project Scope (MVP)](#project-scope-mvp)
- [Project Status](#project-status)
- [License](#license)

## Project Description

**10x-cards** automates the creation of flashcards to make studying and learning more efficient. Users can paste text from notes, articles, or documents, and the application leverages an AI model to generate a structured deck of questions and answers.

The core goal is to eliminate the time-consuming process of manually creating study materials, allowing students and lifelong learners to focus on what matters most: learning.

## Tech Stack

This project uses a modern, type-safe stack designed for performance and a great developer experience.

| Category           | Technology                                                                                                                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**       | [Astro 5](https://astro.build/), [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/) |
| **Backend**        | [Supabase](https://supabase.com/) (Self-Hosted), [Astro API Routes](https://docs.astro.build/en/guides/endpoints/)                                                                              |
| **AI Integration** | [OpenRouter](https://openrouter.ai/)                                                                                                                                                            |
| **Database**       | [PostgreSQL](https://www.postgresql.org/)                                                                                                                                                       |
| **DevOps**         | [Docker](https://www.docker.com/), [GitHub Actions](https://github.com/features/actions)                                                                                                        |

## Getting Started Locally

Follow these instructions to set up and run the project on your local machine.

### Prerequisites

- **Node.js**: Version `22.14.0`. It is recommended to use a version manager like [nvm](https://github.com/nvm-sh/nvm).
- **npm** (comes with Node.js)
- **Docker** and **Docker Compose** (for running Supabase locally)

### Installation

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/your-username/10x-cards.git
    cd 10x-cards
    ```

2.  **Set the correct Node.js version:**

    ```sh
    nvm use 22.14.0
    ```

3.  **Install dependencies:**

    ```sh
    npm install
    ```

4.  **Set up environment variables:**
    Create a `.env` file by copying the example file:

    ```sh
    cp .env.example .env
    ```

    Then, fill in the required variables. You will need to set up a Supabase instance (or use the provided Docker setup) and get an API key from OpenRouter.

    ```env
    # .env
    SUPABASE_URL=your_supabase_url
    SUPABASE_ANON_KEY=your_supabase_anon_key
    OPENROUTER_API_KEY=your_openrouter_api_key
    ```

5.  **Run the development server:**
    ```sh
    npm run dev
    ```
    The application will be available at `http://localhost:4321`.

## Available Scripts

The following scripts are available in `package.json`:

| Script             | Description                            |
| ------------------ | -------------------------------------- |
| `npm run dev`      | Starts the Astro development server.   |
| `npm run build`    | Builds the application for production. |
| `npm run preview`  | Previews the production build locally. |
| `npm run lint`     | Lints the code using ESLint.           |
| `npm run lint:fix` | Automatically fixes linting issues.    |
| `npm run format`   | Formats the code using Prettier.       |

## Project Scope (MVP)

The initial version of the project includes the following features and limitations:

### Key Features

- **User Authentication**: Secure sign-up and login.
- **AI-Powered Generation**: Create flashcard decks from text input (up to 10,000 characters).
- **Deck Management**: Decks are created as editable `Drafts`. Once complete, they can be `Published` to become read-only.
- **Card Management**: Full CRUD (Create, Read, Update, Delete) operations on cards within a `Draft` deck.
- **Learning Mode**: A simple interface to review cards from a `Published` deck.
- **Soft Deletes**: Decks can be soft-deleted and hidden from view.

### Constraints

- **Input Limit**: 10,000 characters per generation request.
- **Output Limit**: A maximum of 20 cards are generated per request.
- **Content Limit**: Card fronts and backs are limited to 200 characters each.
- **Concurrency**: Only one generation session is allowed per user at a time.

## Project Status

**Current Phase: In Development (MVP)**

The project is actively being developed to meet the MVP scope. Features planned for future releases include:

- Advanced database security with Row-Level Security (RLS).
- Rate limiting and usage quotas.
- Internationalization (i18n).
- Front-end telemetry and monitoring.

## License

This project is licensed under the **MIT License**. See the `LICENSE` file for more details.
