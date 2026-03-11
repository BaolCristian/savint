import { PrismaClient, QuestionType, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create demo teacher
  const teacher = await prisma.user.upsert({
    where: { email: "docente@scuola.it" },
    update: {},
    create: {
      email: "docente@scuola.it",
      name: "Prof. Demo",
      role: Role.TEACHER,
      googleId: "demo-google-id",
    },
  });

  console.log("Created teacher:", teacher.email);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@scuola.it" },
    update: {},
    create: {
      email: "admin@scuola.it",
      name: "Admin",
      role: Role.ADMIN,
      googleId: "demo-admin-google-id",
    },
  });

  console.log("Created admin:", admin.email);

  // Create demo quiz 1: Geografia
  const quiz1 = await prisma.quiz.create({
    data: {
      title: "Quiz di Geografia - Capitali Europee",
      description: "Testa le tue conoscenze sulle capitali d'Europa!",
      authorId: teacher.id,
      tags: ["geografia", "europa", "capitali"],
      questions: {
        create: [
          {
            type: QuestionType.MULTIPLE_CHOICE,
            text: "Qual e la capitale della Francia?",
            timeLimit: 20,
            points: 1000,
            order: 0,
            options: {
              choices: [
                { text: "Londra", isCorrect: false },
                { text: "Parigi", isCorrect: true },
                { text: "Berlino", isCorrect: false },
                { text: "Madrid", isCorrect: false },
              ],
            },
          },
          {
            type: QuestionType.TRUE_FALSE,
            text: "Roma e la capitale dell'Italia",
            timeLimit: 15,
            points: 1000,
            order: 1,
            options: { correct: true },
          },
          {
            type: QuestionType.OPEN_ANSWER,
            text: "Come si chiama la capitale della Germania?",
            timeLimit: 30,
            points: 1000,
            order: 2,
            options: { acceptedAnswers: ["Berlino", "berlino", "Berlin"] },
          },
          {
            type: QuestionType.ORDERING,
            text: "Ordina queste capitali da nord a sud",
            timeLimit: 30,
            points: 1000,
            order: 3,
            options: {
              items: ["Helsinki", "Berlino", "Roma", "Atene"],
              correctOrder: [0, 1, 2, 3],
            },
          },
          {
            type: QuestionType.MATCHING,
            text: "Abbina ogni paese alla sua capitale",
            timeLimit: 30,
            points: 1000,
            order: 4,
            options: {
              pairs: [
                { left: "Spagna", right: "Madrid" },
                { left: "Portogallo", right: "Lisbona" },
                { left: "Grecia", right: "Atene" },
              ],
            },
          },
        ],
      },
    },
  });

  console.log("Created quiz:", quiz1.title);

  // Create demo quiz 2: Scienze
  const quiz2 = await prisma.quiz.create({
    data: {
      title: "Quiz di Scienze - Il Sistema Solare",
      description: "Quanto conosci il nostro sistema solare?",
      authorId: teacher.id,
      tags: ["scienze", "astronomia", "sistema solare"],
      questions: {
        create: [
          {
            type: QuestionType.MULTIPLE_CHOICE,
            text: "Qual e il pianeta piu grande del sistema solare?",
            timeLimit: 20,
            points: 1000,
            order: 0,
            options: {
              choices: [
                { text: "Saturno", isCorrect: false },
                { text: "Giove", isCorrect: true },
                { text: "Nettuno", isCorrect: false },
                { text: "Urano", isCorrect: false },
              ],
            },
          },
          {
            type: QuestionType.TRUE_FALSE,
            text: "Il Sole e una stella",
            timeLimit: 10,
            points: 1000,
            order: 1,
            options: { correct: true },
          },
          {
            type: QuestionType.ORDERING,
            text: "Ordina i pianeti dal piu vicino al Sole",
            timeLimit: 45,
            points: 1000,
            order: 2,
            options: {
              items: ["Mercurio", "Venere", "Terra", "Marte"],
              correctOrder: [0, 1, 2, 3],
            },
          },
        ],
      },
    },
  });

  console.log("Created quiz:", quiz2.title);
  console.log("Seed completed!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
