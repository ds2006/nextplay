# Sleek Kanban Task Board

A modern, minimalist Kanban-style task management application built with **React**, **Vite**, and **Supabase**. This tool is designed with a "UX-first" philosophy, focusing on a clean interface and smooth user experience for efficient productivity.

## Features

* **Drag-and-Drop Workflow:** Seamlessly move tasks between columns (Status updates).
* **Full CRUD:** Add, edit, delete, and view tasks with ease.
* **Smart Filtering:** Filter tasks based on urgency levels to focus on what matters most.
* **Search Functionality:** Quickly find specific tasks via a real-time search bar.
* **Organization:** Track due dates, labels, and external links for every task.
* **Responsive Design:** A sleek, card-based UI that adapts to your screen.

## Tech Stack

* **Frontend:** React.js, Vite, Tailwind CSS
* **Backend/Database:** Supabase (PostgreSQL)
* **State Management:** React Hooks (useState, useEffect)

## Database Schema

The application utilizes a PostgreSQL table with the following structure:

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | uuid | Primary Key |
| `title` | text | Task Heading |
| `status` | text | Kanban Column (To Do, In Progress, etc.) |
| `priority` | text | Urgency Level |
| `due_date` | date | Completion Deadline |
| `activity` | jsonb | Task History Log |
| `label_names`| text[]| Tagging System |

## Getting Started

### Prerequisites
* Node.js (v18 or higher)
* A Supabase account and project

### Installation

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <project-folder-name>
2. **Install dependencies:**
   ```bash
   npm install
3. **Configure Environment Variables:**
4. **Launch the app:**
   ```bash
   npm run dev
