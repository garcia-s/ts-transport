import { createServer } from "http";
import { TransportServer } from "../lib";

describe("hello", () => {
  test("Creating a Transport server with a path", (done) => {
    //ARRANGE
    const server = createServer();
    const transport: TransportServer = new TransportServer({
      server,
      path: "/path",
    });
    server.listen(3030);
    //ACT
    //ASSERT
  });
});
