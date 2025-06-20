import type { Core } from "@strapi/strapi";
import { faker } from "@faker-js/faker";

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    // 1. Generate a list of users. (Store their doc IDs in an array after generation by Strapi)

    const randomUsers = faker.helpers.multiple(
      () => ({
        username: faker.internet.username(),
        email: faker.internet.email(),
      }),
      { count: 10 }
    );

    const users = await Promise.all(
      randomUsers.map((randomUser) =>
        strapi.documents("plugin::users-permissions.user").create({
          data: {
            ...randomUser,
          },
        })
      )
    );

    // 2. Generate a list of tasks, and randomly assign users from the above array to them

    const randomTasks = faker.helpers.multiple(
      () => ({
        user: users[faker.number.int({ min: 0, max: users.length - 1 })],
        title: faker.lorem.sentence(),
      }),
      { count: 1000 }
    );

    randomTasks.forEach(async (task) => {
      await strapi.documents("api::task.task").create({
        data: {
          ...task,
        },
      });
    });
  },
};
