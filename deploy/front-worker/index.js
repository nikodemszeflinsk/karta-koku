// Public address of the app: https://kuchnia-formularze.nikodemszeflinsk.workers.dev
// Forwards every request, unchanged, to the main Worker (sushi-chef-lab) through a
// service binding. The main Worker is deployed by Workers Builds from this repository;
// this tiny front only gives it the new name. Deploy: npx wrangler deploy (in this folder).
export default {
  fetch(request, env) {
    return env.APP.fetch(request);
  },
};
