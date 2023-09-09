<h1 align="center">GalaxiteUtils</h1>

# WARNING: THIS IS SUPER WIP
I'm waiting on a lot of scripting features to make this even better, namely titles. Then I have 0 JS/TS experience (the first proper build caused a crash lol), so any PRs for efficiency or anything would be much appreciated.

## A Latite script that adds a variety of Galaxite-related modules.
Don't want to say gg after every game? Want to show your viewers what perk you're using? Don't like the bossbar? This is for you - all of those and more are actual modules!

Module list:
- **AutoGG:** Automatically sends "gg" to the chat whenever a game ends.

Future Plans:
- **Auto-Modules:** Allows you to automatically disable certain modules that may conflict with a game.
  - Toggle Sprint in The Entity, and Coordinates in Chronos.
- **Bossbar -> UI:** Not a fan of the bossbar? This makes it a standard module instead!
- **The Entity Speedrun Timer:** Tracks how long a run takes, and in the future, full splits!
- **Kit UI:** Shows what perk, engine, or kit you're using, as well as what loot modifiers are in your Rush game.
  - There's also an Advanced option that can add useful details, like time until item regeneration!
- **Parkour Builders Attempt Counter:** Insert Geometry Dash soundbyte here
- **Team UI:** Because Galaxite doesn't have this natively for some reason.
- **WhereAmIHUD:** Automatically runs `/whereami` on joining any game, and keeps whatever details you want on screen too!

## Issues
I'm expecting a lot of desync-related bugs, so please include steps to reproduce anything weird you may find. Otherwise, just be clear.

I'm also cool with suggestions, but don't expect me to implement everything.

## PRs
I'll probably accept PRs for the following fairly quickly:
- Code cleanup
- Bug fixes
- Correcting random inconsistencies

I'll take a bit longer with modules, don't want them to be doing anything harmful, but I'm not against them. If you want to make a new module, in addition to normal Latite module things, make sure to add the following to the start of any file:
```ts
import notOnGalaxite from "index";
```
as well as add this line of code to any event:
```ts
if(notOnGalaxite()) return;
```
Those will make the remainder of your code only occur on Galaxite. Beyond that, my only criteria is that it works and adds a new, useful feature; I'd especially be happy with modules for games I don't play a lot.

## Building
This uses [the template found here](https://github.com/LatiteScripting/Template) as a base, so it can be compiled with Ctrl-Shift-B in VS Code once cloned. Just make sure to download the Node modules first (I think that's `npm i`?).

The terminal command `npx tsc -b` in the root folder also works.

Uhh...is that everything? Am I GitHub-ing right?