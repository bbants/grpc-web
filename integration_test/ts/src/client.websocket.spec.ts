// gRPC-Web library
import { grpc } from "grpc-web-client";

import { debug } from "../../../client/grpc-web-client/src/debug";
import { assert } from "chai";
// Generated Test Classes
import { PingRequest, PingResponse } from "../_proto/improbable/grpcweb/test/test_pb";
import { TestService } from "../_proto/improbable/grpcweb/test/test_pb_service";
import { DEBUG } from "./util";
import { headerTrailerCombos, runWithHttp1AndHttp2 } from "./testRpcCombinations";
import { conditionallyRunTestSuite, SuiteEnum } from "../suiteUtils";
import {TestMiddleware} from "./middleware";

if (process.env.DISABLE_WEBSOCKET_TESTS) {
  console.log(`Skipping "clientWebsockets" suite as "DISABLE_WEBSOCKET_TESTS" is set`);
  describe("skipping client-streaming (websockets)", () => {
    it("should skip client-streaming request tests", (done) => {
      done();
    });
  });
} else {
  conditionallyRunTestSuite(SuiteEnum.clientWebsockets, () => {
    runWithHttp1AndHttp2(({testHostUrl}) => {
      describe("client-streaming (websockets)", () => {
        headerTrailerCombos((withHeaders, withTrailers) => {
          it("should make a client-streaming request", (done) => {
            let didGetOnHeaders = false;
            let didGetMessage = false;
            let middleware: TestMiddleware;

            const client = grpc.client(TestService.PingStream, {
              debug: DEBUG,
              host: testHostUrl,
              transport: grpc.WebsocketTransport(),
              middleware: (descriptor, props) => {
                middleware = new TestMiddleware(descriptor, props);
                return middleware;
              }
            });
            client.onHeaders((headers: grpc.Metadata) => {
              DEBUG && debug("headers", headers);
              didGetOnHeaders = true;
              assert.deepEqual(middleware.calls.onHeaders, headers);
              if (withHeaders) {
                assert.deepEqual(headers.get("HeaderTestKey1"), ["ServerValue1"]);
                assert.deepEqual(headers.get("HeaderTestKey2"), ["ServerValue2"]);
              }
            });
            client.onMessage((message: PingResponse) => {
              assert.ok(message instanceof PingResponse);
              assert.deepEqual(message.getValue(), "one,two");
              assert.deepEqual(middleware.calls.onMessage, message);
              didGetMessage = true;
            });
            client.onEnd((status: grpc.Code, statusMessage: string, trailers: grpc.Metadata) => {
              DEBUG && debug("status", status, "statusMessage", statusMessage);
              assert.deepEqual(middleware.calls.onEnd, [status, statusMessage, trailers]);
              assert.strictEqual(status, grpc.Code.OK, "expected OK (0)");
              assert.strictEqual(statusMessage, "", "expected no message");
              if (withTrailers) {
                assert.deepEqual(trailers.get("TrailerTestKey1"), ["ServerValue1"]);
                assert.deepEqual(trailers.get("TrailerTestKey2"), ["ServerValue2"]);
              }
              assert.ok(didGetOnHeaders, "didGetOnHeaders");
              assert.ok(didGetMessage, "didGetMessage");
              assert.deepEqual(middleware.calls.onFinishSend, true);
              done();
            });

            client.start();

            const pingOne = new PingRequest();
            pingOne.setSendHeaders(withHeaders);
            pingOne.setSendTrailers(withTrailers);
            pingOne.setValue(`one`);
            client.send(pingOne);

            const pingTwo = new PingRequest();
            pingTwo.setValue(`two`);
            client.send(pingTwo);

            client.finishSend();
          });
        });
      });

      describe("bidirectional (websockets)", () => {
        headerTrailerCombos((withHeaders, withTrailers) => {
          it("should make a bidirectional request that is terminated by the client", (done) => {
            let didGetOnHeaders = false;
            let counter = 1;
            let lastMessage = `helloworld:${counter}`;
            let middleware: TestMiddleware;

            const ping = new PingRequest();
            ping.setSendHeaders(withHeaders);
            ping.setSendTrailers(withTrailers);
            ping.setValue(lastMessage);

            const client = grpc.client(TestService.PingPongBidi, {
              debug: DEBUG,
              host: testHostUrl,
              transport: grpc.WebsocketTransport(),
              middleware: (descriptor, props) => {
                middleware = new TestMiddleware(descriptor, props);
                return middleware;
              }
            });
            client.onHeaders((headers: grpc.Metadata) => {
              DEBUG && debug("headers", headers);
              didGetOnHeaders = true;
              assert.deepEqual(middleware.calls.onHeaders, headers);
              if (withHeaders) {
                assert.deepEqual(headers.get("HeaderTestKey1"), ["ServerValue1"]);
                assert.deepEqual(headers.get("HeaderTestKey2"), ["ServerValue2"]);
              }
            });
            client.onMessage((message: PingResponse) => {
              assert.deepEqual(middleware.calls.onMessage, message);
              assert.ok(message instanceof PingResponse);
              assert.deepEqual(message.getValue(), lastMessage);

              if (counter === 10) {
                client.finishSend();
              } else {
                counter++;
                lastMessage = `helloworld:${counter}`;
                const ping = new PingRequest();
                ping.setValue(lastMessage);
                client.send(ping);
              }
            });
            client.onEnd((status: grpc.Code, statusMessage: string, trailers: grpc.Metadata) => {
              DEBUG && debug("status", status, "statusMessage", statusMessage);
              assert.deepEqual(middleware.calls.onEnd, [status, statusMessage, trailers]);
              assert.strictEqual(status, grpc.Code.OK, "expected OK (0)");
              assert.strictEqual(statusMessage, "", "expected no message");
              if (withTrailers) {
                assert.deepEqual(trailers.get("TrailerTestKey1"), ["ServerValue1"]);
                assert.deepEqual(trailers.get("TrailerTestKey2"), ["ServerValue2"]);
              }
              assert.ok(didGetOnHeaders, "didGetOnHeaders");

              assert.equal(counter, 10, "counter should have been incremented to 10");
              done();
            });
            client.start();

            // send initial message
            client.send(ping);
          });
        });

        headerTrailerCombos((withHeaders, withTrailers) => {
          it("should make a bidirectional request that is terminated by the server", (done) => {
            let didGetOnHeaders = false;
            let didGetOnMessage = false;

            let counter = 1;
            let lastMessage = `helloworld:${counter}`;
            const ping = new PingRequest();
            ping.setSendHeaders(withHeaders);
            ping.setSendTrailers(withTrailers);
            ping.setValue(lastMessage);

            const client = grpc.client(TestService.PingPongBidi, {
              debug: DEBUG,
              host: testHostUrl,
              transport: grpc.WebsocketTransport(),
            });
            client.onHeaders((headers: grpc.Metadata) => {
              DEBUG && debug("headers", headers);
              didGetOnHeaders = true;
              if (withHeaders) {
                assert.deepEqual(headers.get("HeaderTestKey1"), ["ServerValue1"]);
                assert.deepEqual(headers.get("HeaderTestKey2"), ["ServerValue2"]);
              }
            });
            client.onMessage((message: PingResponse) => {
              assert.ok(message instanceof PingResponse);
              assert.deepEqual(message.getValue(), lastMessage);

              if (counter === 10) {
                const ping = new PingRequest();
                ping.setFailureType(PingRequest.FailureType.CODE);
                ping.setErrorCodeReturned(grpc.Code.OK);
                client.send(ping);
              } else {
                counter++;
                lastMessage = `helloworld:${counter}`;
                const ping = new PingRequest();
                ping.setValue(lastMessage);
                client.send(ping);
              }
            });
            client.onEnd((status: grpc.Code, statusMessage: string, trailers: grpc.Metadata) => {
              DEBUG && debug("status", status, "statusMessage", statusMessage);
              assert.strictEqual(status, grpc.Code.OK, "expected OK (0)");
              assert.strictEqual(statusMessage, "", "expected no message");
              if (withTrailers) {
                assert.deepEqual(trailers.get("TrailerTestKey1"), ["ServerValue1"]);
                assert.deepEqual(trailers.get("TrailerTestKey2"), ["ServerValue2"]);
              }
              assert.ok(didGetOnHeaders, "didGetOnHeaders");

              assert.equal(counter, 10, "counter should have been incremented to 10");
              done();
            });
            client.start();

            // send initial message
            client.send(ping);
          });
        });
      });
    });
  });
}
