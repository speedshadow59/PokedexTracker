import React from "react";
import ReactDOM from "react-dom";

function App() {
  return (
    <div>
      <h1>Pokédex Tracker</h1>
      <p>Track your Pokémon progress here!</p>
      {/* Add CRUD calls to your Azure Functions */}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));