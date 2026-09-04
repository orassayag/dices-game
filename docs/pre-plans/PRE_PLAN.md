Welcome to your task!
Before you begin, we kindly ask that you read through the following instructions carefully. It is
important that you understand all the requirements and expectations to ensure your success.
Please take the necessary time to review every detail of the task. If you have any questions or
need further clarification, do not hesitate to reach out.
Good luck, and we look forward to seeing your excellent work!

Home Assignment - Interview Question

Goal:
Build a dice game where all game logic lives in a backend API and a React frontend to display the game.
Here is an inspirational demo - https://www.youtube.com/watch?v=K4g39bWhZpo
If you can't see the videos, here are the images here:
1.png - start, before the use set the maximum score to win.
2.png - after score set - Player 2 turn.
3.png - Player 1 turn.
4.png - Player 2 turn again.
5.png - Player 1 turn again.
6.png - Player 2 wins.

Rules:
1. The game has 2 players, playing in rounds.
2. On a turn, a player rolls 2 dice as many times as they want.
3. Each roll adds to the round score.
4. If the player rolls 6 & 6, the round score is lost, and the turn passes.
5. A player can Hold:
a. The round score is added to the global score
b. Turn passes to the next player.
6. The first player to reach the winning score wins.
7. Players can set the winning score (default: 100).
8. A player can start a new game at any time.

BACKEND:
========
1. Implement an API with authentication.
2. The API is responsible for:
a. Managing the identities of the players.
b. Enforcing all game rules.
c. Managing game state.
d. Validating turns and actions.
3. Only authenticated users can create and play games.

For the sake of the exercise, simulate the different users on the same page. No need for live updates between different browsers/machine.

FRONTEND:
=========
1. React app that:
a. Authenticates the user.
b. Displays game state.
c. Calls the API for all actions (roll, hold, new game).

No game logic should live in the frontend.

EXTRA:
======
1. Track how many times a player has won.
2. Persist data (e.g. database or local storage). Use database.
3. Add an AI opponent.
4. On rolling 6 & 6, disable actions briefly and show a message or animation.
5. Add sound effects or background music.
6. Any other creative additions are welcome.